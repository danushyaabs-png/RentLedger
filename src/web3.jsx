import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, ZeroHash } from "ethers";
import abi from "./abi.json";
import { CHAIN_ID, CHAIN_ID_HEX, CHAIN_NAME, CONTRACT_ADDRESS, EXPLORER, RPC_URL } from "./config";
import { explainError, txLink } from "./utils";
import { getIdToken, saveDisplayName, signOutGoogle, watchGoogleUser } from "./firebase";

const Web3Context = createContext(null);

const readProvider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const readContract = new Contract(CONTRACT_ADDRESS, abi, readProvider);

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [version, setVersion] = useState(0); // bump to make views reload data
  const [toasts, setToasts] = useState([]);
  // Wallet identity as stored on-chain: { account, id } where id is the bytes32 hash or null
  const [walletIdentity, setWalletIdentity] = useState({ account: null, id: null });
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [googleUser, setGoogleUser] = useState(undefined); // undefined = still loading, null = signed out
  // Identity hash that belongs to the signed-in Google account: { uid, id, error }
  const [googleIdentity, setGoogleIdentity] = useState({ uid: null, id: null, error: null });
  const toastId = useRef(0);

  const hasWallet = typeof window !== "undefined" && !!window.ethereum;
  const onRightChain = chainId === CHAIN_ID;

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // Google sign-in state
  useEffect(() => watchGoogleUser(setGoogleUser), []);

  // The name the user chose for themselves (asked once after Google sign-in)
  const [userName, setUserName] = useState(null);
  const nameKey = (uid) => `rentledger-name-${uid}`;
  useEffect(() => {
    if (!googleUser) return setUserName(null);
    try {
      setUserName(localStorage.getItem(nameKey(googleUser.uid)));
    } catch {
      setUserName(null);
    }
  }, [googleUser]);
  const saveUserName = useCallback(
    async (name) => {
      const n = name.trim().replace(/\s+/g, " ");
      await saveDisplayName(n).catch(() => {}); // still works on this device if Firebase is unreachable
      try {
        localStorage.setItem(nameKey(googleUser.uid), n);
      } catch {
        /* private mode: keep it for this session only */
      }
      setUserName(n);
    },
    [googleUser]
  );
  const displayName = userName || googleUser?.displayName || googleUser?.email?.split("@")[0] || "";

  // Ask the verifier which identity hash belongs to the signed-in Google account
  const loadGoogleIdentity = useCallback(async (user) => {
    setGoogleIdentity({ uid: user.uid, id: null, error: null });
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identity", idToken: await getIdToken(user) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.identity) throw new Error(body.error || "Couldn't check your Google account.");
      setGoogleIdentity({ uid: user.uid, id: body.identity, error: null });
    } catch (e) {
      setGoogleIdentity({ uid: user.uid, id: null, error: e.message || "Couldn't check your Google account." });
    }
  }, []);
  useEffect(() => {
    if (googleUser) loadGoogleIdentity(googleUser);
    else setGoogleIdentity({ uid: null, id: null, error: null });
  }, [googleUser, loadGoogleIdentity]);

  // Load the connected wallet's verified identity from the contract
  useEffect(() => {
    let alive = true;
    if (!account) {
      setWalletIdentity({ account: null, id: null });
      return;
    }
    readContract
      .identityOf(account)
      .then((id) => alive && setWalletIdentity({ account, id: id === ZeroHash ? null : id }))
      .catch(() => alive && setWalletIdentity({ account, id: null }));
    return () => {
      alive = false;
    };
  }, [account, version]);
  const identityReady = !!account && walletIdentity.account === account;
  const identity = identityReady ? walletIdentity.id : null;

  const pushToast = useCallback((toast) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, ...toast }]);
    return id;
  }, []);
  const updateToast = useCallback((id, patch) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Auto-dismiss finished toasts
  const scheduled = useRef(new Set());
  useEffect(() => {
    toasts
      .filter((t) => t.kind !== "pending" && !scheduled.current.has(t.id))
      .forEach((t) => {
        scheduled.current.add(t.id);
        setTimeout(() => dismissToast(t.id), t.kind === "error" ? 9000 : 6000);
      });
  }, [toasts, dismissToast]);

  // Pick up an already-connected wallet and listen for changes
  useEffect(() => {
    if (!hasWallet) return;
    const eth = window.ethereum;
    eth.request({ method: "eth_accounts" }).then((a) => setAccount(a[0] || null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(parseInt(c, 16))).catch(() => {});
    const onAccounts = (a) => setAccount(a[0] || null);
    const onChain = (c) => setChainId(parseInt(c, 16));
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [hasWallet]);

  const switchNetwork = useCallback(async () => {
    const eth = window.ethereum;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (err) {
      if (err.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: CHAIN_NAME,
              nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else {
        throw err;
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!hasWallet) {
      window.open("https://metamask.io/download/", "_blank", "noopener");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0] || null);
      const c = parseInt(await window.ethereum.request({ method: "eth_chainId" }), 16);
      setChainId(c);
      if (c !== CHAIN_ID) await switchNetwork();
    } catch (e) {
      pushToast({ kind: "error", title: "Couldn't connect", body: explainError(e) });
    }
  }, [hasWallet, switchNetwork, pushToast]);

  /** Sign out of Google and disconnect the wallet from this site. */
  const signOutAll = useCallback(async () => {
    try {
      await window.ethereum?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {
      /* older wallets don't support this; the account is simply forgotten below */
    }
    setAccount(null);
    await signOutGoogle();
  }, []);

  /**
   * Send a transaction. `fn` receives a signer-connected contract and must return the tx.
   * Handles network switching, toasts, error messages and refreshing data afterwards.
   */
  const sendTx = useCallback(
    async (label, fn) => {
      if (!account) {
        await connect();
        return false;
      }
      const id = pushToast({ kind: "pending", title: label, body: "Confirm in MetaMask…" });
      try {
        if (chainId !== CHAIN_ID) await switchNetwork();
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new Contract(CONTRACT_ADDRESS, abi, signer);
        const tx = await fn(contract);
        updateToast(id, { body: "Waiting for the block to confirm…", link: txLink(tx.hash) });
        await tx.wait();
        updateToast(id, { kind: "success", body: "Done. It's recorded on the blockchain.", link: txLink(tx.hash) });
        refresh();
        return true;
      } catch (e) {
        console.error(e);
        updateToast(id, { kind: "error", body: explainError(e, readContract.interface) });
        return false;
      }
    },
    [account, chainId, connect, switchNetwork, pushToast, updateToast, refresh]
  );

  const value = useMemo(
    () => ({
      account,
      chainId,
      hasWallet,
      onRightChain,
      connect,
      switchNetwork,
      readContract,
      sendTx,
      version,
      refresh,
      toasts,
      dismissToast,
      identity,
      identityReady,
      isVerified: !!identity,
      googleUser,
      userName,
      displayName,
      needsName: !!googleUser && !userName,
      saveUserName,
      googleIdentity,
      retryGoogleIdentity: () => googleUser && loadGoogleIdentity(googleUser),
      signOutAll,
      verifyOpen,
      openVerify: () => setVerifyOpen(true),
      closeVerify: () => setVerifyOpen(false),
    }),
    [account, chainId, hasWallet, onRightChain, connect, switchNetwork, sendTx, version, refresh, toasts, dismissToast, identity, identityReady, verifyOpen, googleUser, userName, displayName, saveUserName, googleIdentity, loadGoogleIdentity, signOutAll]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  return useContext(Web3Context);
}

/** Load async data from the contract, reloading whenever `deps` or the global version changes. */
export function useContractData(loader, deps) {
  const { version } = useWeb3();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loader()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => {
        console.error(error);
        alive && setState({ data: null, loading: false, error });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return state;
}
