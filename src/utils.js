import { formatEther, parseEther } from "ethers";
import { EXPLORER } from "./config";

export const LEASE_STATUS = ["None", "Active", "Completed", "Terminated"];
export const REQUEST_STATUS = ["Open", "In progress", "Resolved"];
// Rental request status, same order as the contract enum
export const RENTAL_STATUS = ["None", "Pending", "Approved", "Declined", "Cancelled", "Accepted"];

export const DAY = 86400;
export const MONTH = 30 * DAY;
export const GRACE_PERIOD = 5 * DAY;
export const DEFAULT_PERIOD = 30 * DAY;
export const DEPOSIT_CLAIM_WINDOW = 14 * DAY;

/** Convert an ethers struct Result into a plain object, and a list of them into an array. */
export const struct = (r) => r.toObject();
export const structs = (list) => Array.from(list, (s) => s.toObject());

export function eth(wei, digits = 4) {
  if (wei === undefined || wei === null) return "–";
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 0.0001) return n.toLocaleString("en-US", { maximumSignificantDigits: 4, maximumFractionDigits: 18 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function toWei(value) {
  const v = String(value ?? "").trim();
  if (!v) return 0n;
  return parseEther(v);
}

export function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function sameAddr(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function date(ts) {
  const n = Number(ts);
  if (!n) return "–";
  return new Date(n * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export const txLink = (hash) => `${EXPLORER}/tx/${hash}`;
export const addrLink = (a) => `${EXPLORER}/address/${a}`;

const ERROR_MESSAGES = {
  NotLandlord: "Only the landlord of this property can do that.",
  NotTenant: "Only the tenant on this lease can do that.",
  NotLeaseParty: "Only the landlord or tenant on this lease can do that.",
  PropertyNotFound: "That property doesn't exist.",
  LeaseNotFound: "That lease doesn't exist.",
  RequestNotFound: "That maintenance request doesn't exist.",
  PropertyNotAvailable: "This home is no longer available. Someone may have just rented it.",
  PropertyCurrentlyRented: "You can't edit a home while it's rented.",
  LandlordCannotRentOwnProperty: "You can't rent your own property. Switch to your tenant account in MetaMask.",
  InvalidAmount: "Rent must be more than 0.",
  InvalidDuration: "Lease length must be between 1 and 60 months.",
  InvalidFee: "That fee is above the allowed maximum.",
  InvalidText: "A required field is empty or too long.",
  IncorrectPayment: "The amount sent doesn't match what's due. Refresh and try again.",
  LeaseNotActive: "This lease is no longer active.",
  LeaseStillActive: "The lease has to be closed first.",
  LeaseFullyPaid: "Every month of this lease is already paid.",
  RentOutstanding: "All months must be paid before the lease can be closed.",
  NotInDefault: "The tenant isn't more than 30 days overdue yet.",
  DepositAlreadySettled: "The deposit has already been settled.",
  ClaimWindowNotOver: "The landlord still has time to return the deposit.",
  DeductionTooHigh: "The deduction can't be more than the deposit.",
  InvalidStatusChange: "Requests can only move forward: Open, In progress, Resolved.",
  NothingToWithdraw: "You have nothing to withdraw.",
  TransferFailed: "The transfer failed.",
  EnforcedPause: "The platform is paused by the admin. Withdrawals still work.",
  OwnableUnauthorizedAccount: "Only the admin can do that.",
  NotVerified: "Verify your account with Google before listing or renting.",
  SamePerson: "This listing belongs to you. Your wallets are linked to the same Google account, so you can't rent it.",
  InvalidVerification: "The verification pass wasn't accepted. Please verify again.",
  VerificationExpired: "The verification pass expired. Please verify again.",
  IdentityAlreadySet: "This wallet is already linked to a different Google account.",
  RentalRequestNotFound: "That rental request doesn't exist.",
  InvalidRequestState: "This request has already been handled. Refresh to see its latest status.",
  RequestAlreadyOpen: "You already have an open request for this home. Wait for the owner, or cancel it first.",
  AnotherRequestApproved: "You've already approved another request for this home. Decline that one first.",
  HasApprovedRequest: "You can't edit this home while an approved request is waiting for payment.",
  InvalidRating: "Pick between 1 and 5 stars.",
  AlreadyRated: "You've already rated this lease.",
};

export function explainError(e, iface) {
  if (!e) return "Something went wrong.";
  if (e.code === "ACTION_REJECTED" || e.info?.error?.code === 4001 || e.code === 4001) {
    return "You cancelled the transaction in MetaMask.";
  }
  if (e.code === "INSUFFICIENT_FUNDS") {
    return "Not enough Sepolia ETH to cover this and the gas fee. Get more from a faucet.";
  }
  let name = e.revert?.name;
  if (!name && iface) {
    const data = e.data || e.info?.error?.data?.data || e.info?.error?.data || e.error?.data;
    if (typeof data === "string" && data.startsWith("0x")) {
      try {
        name = iface.parseError(data)?.name;
      } catch {
        /* not one of ours */
      }
    }
  }
  if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name];
  if (name) return `The contract rejected this (${name}).`;
  if (e.code === "CALL_EXCEPTION" || /missing revert data/i.test(e.message || "")) {
    return "MetaMask couldn't run this transaction. Check that this account has enough Sepolia ETH, and that its MetaMask smart account is switched off.";
  }
  return e.shortMessage || e.reason || e.message || "Something went wrong.";
}

/** "1 month" / "6 months" */
export const months = (n) => `${Number(n)} month${Number(n) === 1 ? "" : "s"}`;
