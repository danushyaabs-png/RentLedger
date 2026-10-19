// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  RentalManagement
 * @notice Ethereum-based rental management system.
 *         Landlords list properties, tenants rent them by paying a security
 *         deposit + first month's rent. Rent is paid monthly on-chain, the
 *         deposit is held in escrow by the contract, and is settled when the
 *         lease closes. Includes late fees, maintenance requests, default
 *         handling, a deposit-claim timeout for tenant protection, an optional
 *         platform fee, emergency pause and pull-based withdrawals.
 *         Users must verify their identity (Google account, checked off-chain by a
 *         trusted verifier) before listing or renting. Every wallet linked to the same
 *         identity counts as the same person, so nobody can rent their own property
 *         from a second wallet.
 * @dev    All amounts are in wei. 1 "month" = 30 days.
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RentalManagement is Ownable, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────────────────────
    //                          CONSTANTS
    // ─────────────────────────────────────────────────────────────

    uint256 public constant MONTH = 30 days;
    uint256 public constant GRACE_PERIOD = 5 days;            // no late fee within this window after due date
    uint256 public constant DEFAULT_PERIOD = 30 days;         // overdue this long => landlord may terminate
    uint256 public constant DEPOSIT_CLAIM_WINDOW = 14 days;   // landlord must settle deposit within this time
    uint256 public constant MAX_LEASE_MONTHS = 60;
    uint16 public constant MAX_LATE_FEE_BPS = 2000;           // 20% max late fee
    uint16 public constant MAX_PLATFORM_FEE_BPS = 500;        // 5% max platform fee
    uint256 public constant MAX_TEXT_LENGTH = 500;            // bytes, prevents storage spam

    // ─────────────────────────────────────────────────────────────
    //                            TYPES
    // ─────────────────────────────────────────────────────────────

    enum LeaseStatus { None, Active, Completed, Terminated }
    enum RequestStatus { Open, InProgress, Resolved }

    struct Property {
        uint256 id;
        address landlord;
        string name;
        string location;
        string metadataURI;      // image URL or IPFS link
        uint256 rentPerMonth;    // wei
        uint256 securityDeposit; // wei
        uint16 lateFeeBps;       // late fee in basis points (100 = 1%)
        bool isAvailable;        // landlord wants it listed
        bool isRented;
        uint256 activeLeaseId;
        uint256 createdAt;
    }

    struct Lease {
        uint256 id;
        uint256 propertyId;
        address landlord;
        address tenant;
        uint256 rentPerMonth;    // locked at signing, later property edits don't affect it
        uint256 securityDeposit;
        uint16 lateFeeBps;
        uint64 startDate;
        uint64 endDate;
        uint64 nextDueDate;
        uint32 durationMonths;
        uint32 monthsPaid;
        uint64 closedAt;
        LeaseStatus status;
        bool depositSettled;
    }

    struct Payment {
        uint256 leaseId;
        address payer;
        uint256 amount;          // total paid incl. late fee
        uint256 lateFee;
        uint32 monthNumber;
        uint64 paidAt;
    }

    struct MaintenanceRequest {
        uint256 id;
        uint256 propertyId;
        uint256 leaseId;
        address tenant;
        string description;
        RequestStatus status;
        uint64 createdAt;
        uint64 updatedAt;
    }

    // ─────────────────────────────────────────────────────────────
    //                            STORAGE
    // ─────────────────────────────────────────────────────────────

    uint256 public propertyCount;
    uint256 public leaseCount;
    uint256 public requestCount;
    uint16 public platformFeeBps;              // 0 by default

    mapping(uint256 => Property) private properties;
    mapping(uint256 => Lease) private leases;
    mapping(uint256 => MaintenanceRequest) private requests;
    mapping(uint256 => Payment[]) private leasePayments;

    mapping(address => uint256[]) private landlordPropertyIds;
    mapping(address => uint256[]) private tenantLeaseIds;
    mapping(uint256 => uint256[]) private propertyLeaseIds;
    mapping(uint256 => uint256[]) private propertyRequestIds;

    mapping(address => uint256) public pendingWithdrawals; // pull-payment balances
    uint256 public totalEscrowedDeposits;                  // deposits currently held

    // Identity: wallet -> hash of the person's verified identity (salted hash of their Google email).
    // Several wallets may share one identity; they are then treated as the same person.
    address public verifier;                               // signs verification passes off-chain
    mapping(address => bytes32) public identityOf;
    uint256 public verifiedAccounts;

    // ─────────────────────────────────────────────────────────────
    //                            EVENTS
    // ─────────────────────────────────────────────────────────────

    event PropertyListed(uint256 indexed propertyId, address indexed landlord, uint256 rentPerMonth, uint256 securityDeposit);
    event PropertyUpdated(uint256 indexed propertyId);
    event AvailabilityChanged(uint256 indexed propertyId, bool isAvailable);
    event LeaseCreated(uint256 indexed leaseId, uint256 indexed propertyId, address indexed tenant, uint32 durationMonths, uint64 startDate, uint64 endDate);
    event RentPaid(uint256 indexed leaseId, address indexed tenant, uint256 amount, uint256 lateFee, uint32 monthNumber);
    event LeaseClosed(uint256 indexed leaseId, LeaseStatus status, address closedBy);
    event DepositSettled(uint256 indexed leaseId, uint256 refundedToTenant, uint256 deductedForLandlord, string reason);
    event MaintenanceRequested(uint256 indexed requestId, uint256 indexed propertyId, address indexed tenant);
    event MaintenanceStatusUpdated(uint256 indexed requestId, RequestStatus status);
    event Withdrawal(address indexed account, uint256 amount);
    event PlatformFeeUpdated(uint16 newFeeBps);
    event IdentityVerified(address indexed account, bytes32 indexed identity);
    event IdentityRevoked(address indexed account);
    event VerifierUpdated(address indexed verifier);

    // ─────────────────────────────────────────────────────────────
    //                         CUSTOM ERRORS
    // ─────────────────────────────────────────────────────────────

    error NotLandlord();
    error NotTenant();
    error NotLeaseParty();
    error PropertyNotFound();
    error LeaseNotFound();
    error RequestNotFound();
    error PropertyNotAvailable();
    error PropertyCurrentlyRented();
    error LandlordCannotRentOwnProperty();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidFee();
    error InvalidText();
    error IncorrectPayment(uint256 expected, uint256 sent);
    error LeaseNotActive();
    error LeaseStillActive();
    error LeaseFullyPaid();
    error RentOutstanding();
    error NotInDefault();
    error DepositAlreadySettled();
    error ClaimWindowNotOver();
    error DeductionTooHigh();
    error InvalidStatusChange();
    error NothingToWithdraw();
    error TransferFailed();
    error NotVerified();
    error SamePerson();
    error InvalidVerification();
    error VerificationExpired();
    error IdentityAlreadySet();
    error InvalidAddress();

    // ─────────────────────────────────────────────────────────────
    //                          MODIFIERS
    // ─────────────────────────────────────────────────────────────

    modifier propertyExists(uint256 propertyId) {
        if (propertyId == 0 || propertyId > propertyCount) revert PropertyNotFound();
        _;
    }

    modifier leaseExists(uint256 leaseId) {
        if (leaseId == 0 || leaseId > leaseCount) revert LeaseNotFound();
        _;
    }

    modifier onlyPropertyLandlord(uint256 propertyId) {
        if (properties[propertyId].landlord != msg.sender) revert NotLandlord();
        _;
    }

    modifier onlyVerified() {
        if (identityOf[msg.sender] == bytes32(0)) revert NotVerified();
        _;
    }

    /// @param verifier_ Address whose private key (kept on the verification server) signs passes.
    constructor(address verifier_) Ownable(msg.sender) {
        if (verifier_ == address(0)) revert InvalidAddress();
        verifier = verifier_;
        emit VerifierUpdated(verifier_);
    }

    // ─────────────────────────────────────────────────────────────
    //                     IDENTITY VERIFICATION
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Link the caller's wallet to a verified identity.
     * @dev The verifier server checks the user's Google sign-in and a wallet signature,
     *      then signs keccak256(chainId, this contract, wallet, identity, expiry).
     *      A wallet can only ever be linked to one identity.
     */
    function verifyIdentity(bytes32 identity, uint256 expiry, bytes calldata signature) external {
        if (block.timestamp > expiry) revert VerificationExpired();
        if (identity == bytes32(0)) revert InvalidVerification();
        bytes32 current = identityOf[msg.sender];
        if (current != bytes32(0) && current != identity) revert IdentityAlreadySet();

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(block.chainid, address(this), msg.sender, identity, expiry))
        );
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != verifier) revert InvalidVerification();

        if (current == bytes32(0)) verifiedAccounts += 1;
        identityOf[msg.sender] = identity;
        emit IdentityVerified(msg.sender, identity);
    }

    /// @notice True when both wallets are verified and belong to the same person.
    function isSamePerson(address a, address b) public view returns (bool) {
        bytes32 idA = identityOf[a];
        return idA != bytes32(0) && idA == identityOf[b];
    }

    function isVerified(address account) external view returns (bool) {
        return identityOf[account] != bytes32(0);
    }

    // ─────────────────────────────────────────────────────────────
    //                     LANDLORD: PROPERTIES
    // ─────────────────────────────────────────────────────────────

    function listProperty(
        string calldata name,
        string calldata location,
        string calldata metadataURI,
        uint256 rentPerMonth,
        uint256 securityDeposit,
        uint16 lateFeeBps
    ) external whenNotPaused onlyVerified returns (uint256 propertyId) {
        _validateText(name, false);
        _validateText(location, false);
        _validateText(metadataURI, true);
        if (rentPerMonth == 0) revert InvalidAmount();
        if (lateFeeBps > MAX_LATE_FEE_BPS) revert InvalidFee();

        propertyId = ++propertyCount;
        Property storage p = properties[propertyId];
        p.id = propertyId;
        p.landlord = msg.sender;
        p.name = name;
        p.location = location;
        p.metadataURI = metadataURI;
        p.rentPerMonth = rentPerMonth;
        p.securityDeposit = securityDeposit;
        p.lateFeeBps = lateFeeBps;
        p.isAvailable = true;
        p.createdAt = block.timestamp;

        landlordPropertyIds[msg.sender].push(propertyId);
        emit PropertyListed(propertyId, msg.sender, rentPerMonth, securityDeposit);
    }

    /// @notice Edit a property. Only allowed while it is not rented.
    function updateProperty(
        uint256 propertyId,
        string calldata name,
        string calldata location,
        string calldata metadataURI,
        uint256 rentPerMonth,
        uint256 securityDeposit,
        uint16 lateFeeBps
    ) external propertyExists(propertyId) onlyPropertyLandlord(propertyId) {
        Property storage p = properties[propertyId];
        if (p.isRented) revert PropertyCurrentlyRented();
        _validateText(name, false);
        _validateText(location, false);
        _validateText(metadataURI, true);
        if (rentPerMonth == 0) revert InvalidAmount();
        if (lateFeeBps > MAX_LATE_FEE_BPS) revert InvalidFee();

        p.name = name;
        p.location = location;
        p.metadataURI = metadataURI;
        p.rentPerMonth = rentPerMonth;
        p.securityDeposit = securityDeposit;
        p.lateFeeBps = lateFeeBps;
        emit PropertyUpdated(propertyId);
    }

    /// @notice Show / hide a property from the marketplace.
    function setAvailability(uint256 propertyId, bool available)
        external
        propertyExists(propertyId)
        onlyPropertyLandlord(propertyId)
    {
        properties[propertyId].isAvailable = available;
        emit AvailabilityChanged(propertyId, available);
    }

    // ─────────────────────────────────────────────────────────────
    //                       TENANT: RENTING
    // ─────────────────────────────────────────────────────────────

    /// @notice Rent a property. Send exactly securityDeposit + rentPerMonth.
    function rentProperty(uint256 propertyId, uint32 durationMonths)
        external
        payable
        whenNotPaused
        nonReentrant
        onlyVerified
        propertyExists(propertyId)
        returns (uint256 leaseId)
    {
        Property storage p = properties[propertyId];
        if (!p.isAvailable || p.isRented) revert PropertyNotAvailable();
        if (msg.sender == p.landlord) revert LandlordCannotRentOwnProperty();
        if (isSamePerson(msg.sender, p.landlord)) revert SamePerson();
        if (durationMonths == 0 || durationMonths > MAX_LEASE_MONTHS) revert InvalidDuration();

        uint256 expected = p.securityDeposit + p.rentPerMonth;
        if (msg.value != expected) revert IncorrectPayment(expected, msg.value);

        uint64 nowTs = uint64(block.timestamp);
        leaseId = ++leaseCount;
        Lease storage l = leases[leaseId];
        l.id = leaseId;
        l.propertyId = propertyId;
        l.landlord = p.landlord;
        l.tenant = msg.sender;
        l.rentPerMonth = p.rentPerMonth;
        l.securityDeposit = p.securityDeposit;
        l.lateFeeBps = p.lateFeeBps;
        l.startDate = nowTs;
        l.endDate = nowTs + uint64(uint256(durationMonths) * MONTH);
        l.nextDueDate = nowTs + uint64(MONTH);   // first month is prepaid
        l.durationMonths = durationMonths;
        l.monthsPaid = 1;
        l.status = LeaseStatus.Active;

        p.isRented = true;
        p.activeLeaseId = leaseId;

        tenantLeaseIds[msg.sender].push(leaseId);
        propertyLeaseIds[propertyId].push(leaseId);

        totalEscrowedDeposits += p.securityDeposit;
        _creditRent(p.landlord, p.rentPerMonth);

        leasePayments[leaseId].push(Payment(leaseId, msg.sender, p.rentPerMonth, 0, 1, nowTs));

        emit LeaseCreated(leaseId, propertyId, msg.sender, durationMonths, l.startDate, l.endDate);
        emit RentPaid(leaseId, msg.sender, p.rentPerMonth, 0, 1);
    }

    /// @notice Pay the next month's rent. Use getAmountDue() to know the exact value.
    ///         Paying early is allowed (prepayment).
    function payRent(uint256 leaseId) external payable whenNotPaused nonReentrant leaseExists(leaseId) {
        Lease storage l = leases[leaseId];
        if (l.tenant != msg.sender) revert NotTenant();
        if (l.status != LeaseStatus.Active) revert LeaseNotActive();
        if (l.monthsPaid >= l.durationMonths) revert LeaseFullyPaid();

        (, uint256 lateFee, uint256 total) = getAmountDue(leaseId);
        if (msg.value != total) revert IncorrectPayment(total, msg.value);

        l.monthsPaid += 1;
        l.nextDueDate += uint64(MONTH);

        _creditRent(l.landlord, msg.value);

        leasePayments[leaseId].push(Payment(leaseId, msg.sender, msg.value, lateFee, l.monthsPaid, uint64(block.timestamp)));
        emit RentPaid(leaseId, msg.sender, msg.value, lateFee, l.monthsPaid);
    }

    // ─────────────────────────────────────────────────────────────
    //                       LEASE LIFECYCLE
    // ─────────────────────────────────────────────────────────────

    /// @notice Close a lease once all rent is paid. Landlord or tenant may call.
    function completeLease(uint256 leaseId) external leaseExists(leaseId) {
        Lease storage l = leases[leaseId];
        if (msg.sender != l.landlord && msg.sender != l.tenant) revert NotLeaseParty();
        if (l.status != LeaseStatus.Active) revert LeaseNotActive();
        if (l.monthsPaid < l.durationMonths) revert RentOutstanding();
        _closeLease(l, LeaseStatus.Completed);
    }

    /// @notice Landlord can terminate if the tenant is overdue by more than DEFAULT_PERIOD.
    function terminateForNonPayment(uint256 leaseId) external leaseExists(leaseId) {
        Lease storage l = leases[leaseId];
        if (msg.sender != l.landlord) revert NotLandlord();
        if (l.status != LeaseStatus.Active) revert LeaseNotActive();
        if (l.monthsPaid >= l.durationMonths || block.timestamp <= uint256(l.nextDueDate) + DEFAULT_PERIOD) {
            revert NotInDefault();
        }
        _closeLease(l, LeaseStatus.Terminated);
    }

    /// @notice Landlord settles the deposit after the lease closes, optionally
    ///         deducting an amount (e.g. for damages) with a reason.
    function settleDeposit(uint256 leaseId, uint256 deduction, string calldata reason)
        external
        nonReentrant
        leaseExists(leaseId)
    {
        Lease storage l = leases[leaseId];
        if (msg.sender != l.landlord) revert NotLandlord();
        if (l.status == LeaseStatus.Active) revert LeaseStillActive();
        if (l.depositSettled) revert DepositAlreadySettled();
        if (deduction > l.securityDeposit) revert DeductionTooHigh();
        if (bytes(reason).length > MAX_TEXT_LENGTH) revert InvalidText();
        _settleDeposit(l, deduction, reason);
    }

    /// @notice Tenant protection: if the landlord has not settled the deposit within
    ///         DEPOSIT_CLAIM_WINDOW after closing, the tenant gets the full deposit back.
    function claimDeposit(uint256 leaseId) external nonReentrant leaseExists(leaseId) {
        Lease storage l = leases[leaseId];
        if (msg.sender != l.tenant) revert NotTenant();
        if (l.status == LeaseStatus.Active) revert LeaseStillActive();
        if (l.depositSettled) revert DepositAlreadySettled();
        if (block.timestamp < uint256(l.closedAt) + DEPOSIT_CLAIM_WINDOW) revert ClaimWindowNotOver();
        _settleDeposit(l, 0, "Auto-refund: landlord did not settle in time");
    }

    // ─────────────────────────────────────────────────────────────
    //                         MAINTENANCE
    // ─────────────────────────────────────────────────────────────

    function raiseMaintenanceRequest(uint256 leaseId, string calldata description)
        external
        whenNotPaused
        leaseExists(leaseId)
        returns (uint256 requestId)
    {
        Lease storage l = leases[leaseId];
        if (msg.sender != l.tenant) revert NotTenant();
        if (l.status != LeaseStatus.Active) revert LeaseNotActive();
        _validateText(description, false);

        requestId = ++requestCount;
        uint64 nowTs = uint64(block.timestamp);
        requests[requestId] = MaintenanceRequest(
            requestId, l.propertyId, leaseId, msg.sender, description, RequestStatus.Open, nowTs, nowTs
        );
        propertyRequestIds[l.propertyId].push(requestId);
        emit MaintenanceRequested(requestId, l.propertyId, msg.sender);
    }

    /// @notice Landlord moves a request forward: Open -> InProgress -> Resolved.
    function updateMaintenanceStatus(uint256 requestId, RequestStatus newStatus) external {
        if (requestId == 0 || requestId > requestCount) revert RequestNotFound();
        MaintenanceRequest storage r = requests[requestId];
        if (properties[r.propertyId].landlord != msg.sender) revert NotLandlord();
        if (uint8(newStatus) <= uint8(r.status)) revert InvalidStatusChange();
        r.status = newStatus;
        r.updatedAt = uint64(block.timestamp);
        emit MaintenanceStatusUpdated(requestId, newStatus);
    }

    // ─────────────────────────────────────────────────────────────
    //                    WITHDRAWALS (PULL PAYMENTS)
    // ─────────────────────────────────────────────────────────────

    /// @notice Withdraw your balance (rent earned, deposit refunds, platform fees).
    ///         Deliberately NOT pausable so users can always get their money out.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0; // effects before interaction
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────
    //                            ADMIN
    // ─────────────────────────────────────────────────────────────

    function setPlatformFee(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_PLATFORM_FEE_BPS) revert InvalidFee();
        platformFeeBps = newFeeBps;
        emit PlatformFeeUpdated(newFeeBps);
    }

    function setVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidAddress();
        verifier = newVerifier;
        emit VerifierUpdated(newVerifier);
    }

    /// @notice Remove a wallet's identity link (e.g. for a fraudulent account).
    function revokeIdentity(address account) external onlyOwner {
        if (identityOf[account] != bytes32(0)) {
            identityOf[account] = bytes32(0);
            verifiedAccounts -= 1;
            emit IdentityRevoked(account);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─────────────────────────────────────────────────────────────
    //                         VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    /// @notice Exact amount the tenant must send for the next payRent() call.
    function getAmountDue(uint256 leaseId)
        public
        view
        leaseExists(leaseId)
        returns (uint256 rent, uint256 lateFee, uint256 total)
    {
        Lease storage l = leases[leaseId];
        rent = l.rentPerMonth;
        if (block.timestamp > uint256(l.nextDueDate) + GRACE_PERIOD) {
            lateFee = (rent * l.lateFeeBps) / 10_000;
        }
        total = rent + lateFee;
    }

    function getProperty(uint256 propertyId) external view propertyExists(propertyId) returns (Property memory) {
        return properties[propertyId];
    }

    function getLease(uint256 leaseId) external view leaseExists(leaseId) returns (Lease memory) {
        return leases[leaseId];
    }

    function getMaintenanceRequest(uint256 requestId) external view returns (MaintenanceRequest memory) {
        if (requestId == 0 || requestId > requestCount) revert RequestNotFound();
        return requests[requestId];
    }

    function getAllProperties() external view returns (Property[] memory list) {
        list = new Property[](propertyCount);
        for (uint256 i = 0; i < propertyCount; i++) {
            list[i] = properties[i + 1];
        }
    }

    function getAvailableProperties() external view returns (Property[] memory list) {
        uint256 count;
        for (uint256 i = 1; i <= propertyCount; i++) {
            if (properties[i].isAvailable && !properties[i].isRented) count++;
        }
        list = new Property[](count);
        uint256 j;
        for (uint256 i = 1; i <= propertyCount; i++) {
            if (properties[i].isAvailable && !properties[i].isRented) list[j++] = properties[i];
        }
    }

    function getLandlordProperties(address landlord) external view returns (Property[] memory list) {
        uint256[] storage ids = landlordPropertyIds[landlord];
        list = new Property[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) list[i] = properties[ids[i]];
    }

    function getTenantLeases(address tenant) external view returns (Lease[] memory list) {
        uint256[] storage ids = tenantLeaseIds[tenant];
        list = new Lease[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) list[i] = leases[ids[i]];
    }

    function getPropertyLeases(uint256 propertyId) external view returns (Lease[] memory list) {
        uint256[] storage ids = propertyLeaseIds[propertyId];
        list = new Lease[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) list[i] = leases[ids[i]];
    }

    function getLeasePayments(uint256 leaseId) external view returns (Payment[] memory) {
        return leasePayments[leaseId];
    }

    function getPropertyRequests(uint256 propertyId) external view returns (MaintenanceRequest[] memory list) {
        uint256[] storage ids = propertyRequestIds[propertyId];
        list = new MaintenanceRequest[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) list[i] = requests[ids[i]];
    }

    function isOverdue(uint256 leaseId) external view leaseExists(leaseId) returns (bool) {
        Lease storage l = leases[leaseId];
        return l.status == LeaseStatus.Active
            && l.monthsPaid < l.durationMonths
            && block.timestamp > l.nextDueDate;
    }

    // ─────────────────────────────────────────────────────────────
    //                       INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────

    function _creditRent(address landlord, uint256 amount) private {
        uint256 fee = (amount * platformFeeBps) / 10_000;
        if (fee > 0) pendingWithdrawals[owner()] += fee;
        pendingWithdrawals[landlord] += amount - fee;
    }

    function _closeLease(Lease storage l, LeaseStatus finalStatus) private {
        l.status = finalStatus;
        l.closedAt = uint64(block.timestamp);
        Property storage p = properties[l.propertyId];
        p.isRented = false;
        p.activeLeaseId = 0;
        emit LeaseClosed(l.id, finalStatus, msg.sender);
    }

    function _settleDeposit(Lease storage l, uint256 deduction, string memory reason) private {
        l.depositSettled = true;
        totalEscrowedDeposits -= l.securityDeposit;
        uint256 refund = l.securityDeposit - deduction;
        if (refund > 0) pendingWithdrawals[l.tenant] += refund;
        if (deduction > 0) pendingWithdrawals[l.landlord] += deduction;
        emit DepositSettled(l.id, refund, deduction, reason);
    }

    function _validateText(string calldata text, bool allowEmpty) private pure {
        uint256 len = bytes(text).length;
        if ((!allowEmpty && len == 0) || len > MAX_TEXT_LENGTH) revert InvalidText();
    }

    // No receive()/fallback(): plain ETH transfers are rejected so funds can't get stuck.
}

//address of contract : 0x3A0982182923c59F601e7980878d917Bd91c42c0
