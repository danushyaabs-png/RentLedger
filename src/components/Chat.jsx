// Tenant <-> owner chat. Messages go through /api/chat, which checks on the blockchain that the
// signed-in Google account owns the tenant or the owner wallet of the conversation.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { useWeb3 } from "../web3";
import { getIdToken } from "../firebase";
import { addrLink, sameAddr, shortAddr } from "../utils";

const ChatContext = createContext(null);
export const useChat = () => useContext(ChatContext);

async function chatApi(user, body) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, idToken: await getIdToken(user) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Chat is unavailable right now.");
  return json;
}

/** Keeps the inbox fresh (for the unread badge) and owns the pop-up chat window. */
export function ChatProvider({ children }) {
  const { googleUser } = useWeb3();
  const [threads, setThreads] = useState(null);
  const [threadsError, setThreadsError] = useState("");
  const [popup, setPopup] = useState(null); // { propertyId, tenant, title }

  const refreshThreads = useCallback(async () => {
    if (!googleUser) return;
    try {
      const { threads } = await chatApi(googleUser, { action: "threads" });
      setThreads(threads);
      setThreadsError("");
    } catch (e) {
      setThreadsError(e.message);
    }
  }, [googleUser]);

  useEffect(() => {
    refreshThreads();
    const t = setInterval(refreshThreads, 20000);
    return () => clearInterval(t);
  }, [refreshThreads]);

  const value = {
    threads,
    threadsError,
    unread: (threads || []).filter((t) => t.unread).length,
    refreshThreads,
    openChat: setPopup,
    send: (conv, text) => chatApi(googleUser, { action: "send", propertyId: conv.propertyId, tenant: conv.tenant, text }),
    api: (body) => chatApi(googleUser, body),
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
      {popup && (
        <aside className="chat-popup" aria-label="Chat">
          <ChatWindow conv={popup} onClose={() => setPopup(null)} />
        </aside>
      )}
    </ChatContext.Provider>
  );
}

const time = (ms) => {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
};

/** One conversation: (property, tenant wallet). */
export function ChatWindow({ conv, onClose }) {
  const { api, refreshThreads } = useChat();
  const [messages, setMessages] = useState([]);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const lastAt = useRef(0);
  const listRef = useRef(null);
  const key = `${conv.propertyId}-${conv.tenant}`;

  const busy = useRef(false);
  const load = useCallback(async () => {
    if (busy.current) return; // one refresh at a time
    busy.current = true;
    try {
      const res = await api({ action: "messages", propertyId: conv.propertyId, tenant: conv.tenant, since: lastAt.current });
      setInfo(res.thread);
      if (res.messages.length) {
        lastAt.current = Math.max(lastAt.current, res.messages[res.messages.length - 1].at);
        setMessages((m) => {
          const seen = new Set(m.map((x) => `${x.at}-${x.role}-${x.text}`));
          return [...m, ...res.messages.filter((x) => !seen.has(`${x.at}-${x.role}-${x.text}`))];
        });
      }
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    lastAt.current = 0;
    busy.current = false;
    setMessages([]);
    setInfo(null);
    load().then(refreshThreads);
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api({ action: "send", propertyId: conv.propertyId, tenant: conv.tenant, text: body });
      setText("");
      busy.current = false;
      await load();
      refreshThreads();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const role = info?.role;
  const other = info ? (role === "tenant" ? info.landlord : info.tenant) : null;

  return (
    <div className="chat-window">
      <header className="chat-head">
        <span className="chat-avatar" aria-hidden="true">
          <MessageSquare size={18} />
        </span>
        <div>
          <strong>{conv.title || info?.propertyName || `Property #${conv.propertyId}`}</strong>
          <span className="muted small">
            {other ? (
              <>
                {role === "tenant" ? "Owner" : "Tenant"}{" "}
                <a href={addrLink(other)} target="_blank" rel="noreferrer">
                  {shortAddr(other)}
                </a>
              </>
            ) : (
              "Loading…"
            )}
          </span>
        </div>
        {onClose && (
          <button className="chat-close" onClick={onClose} aria-label="Close chat">
            <X size={18} />
          </button>
        )}
      </header>

      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && !error && (
          <p className="chat-empty">
            {role === "landlord" ? "No messages yet. Say hello to the tenant." : "Ask the owner anything about this home."}
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.role === role;
          return (
            <div key={`${m.at}-${i}`} className={`bubble ${mine ? "mine" : "theirs"}`}>
              <p>{m.text}</p>
              <time>{time(m.at)}</time>
            </div>
          );
        })}
      </div>

      {error && <p className="chat-error">{error}</p>}
      <form className="chat-input" onSubmit={submit}>
        <input
          value={text}
          maxLength={1000}
          placeholder="Write a message…"
          aria-label="Message"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || sending} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

/** Messages tab: inbox on the left, conversation on the right. */
export function Messages() {
  const { threads, threadsError, refreshThreads } = useChat();
  const { account } = useWeb3();
  const [open, setOpen] = useState(null);

  useEffect(() => {
    refreshThreads();
  }, [refreshThreads]);
  useEffect(() => {
    if (!open && threads?.length && window.innerWidth > 860) setOpen(threads[0]);
  }, [threads, open]);

  return (
    <section className="section">
      <header className="page-head">
        <h1>Messages</h1>
        <p>Chat with owners about homes you're interested in, and with people who want to rent your homes.</p>
      </header>
      {threadsError && !threads && <p className="error-text">{threadsError}</p>}
      {threads && threads.length === 0 && (
        <div className="empty">
          <p>No conversations yet</p>
          <p className="muted">Open a home and press "Message owner" to start one.</p>
        </div>
      )}
      {threads && threads.length > 0 && (
        <div className={`inbox ${open ? "has-open" : ""}`}>
          <ul className="inbox-list">
            {threads.map((t) => {
              const isOpen = open && open.id === t.id;
              const otherWallet = t.role === "tenant" ? t.landlord : t.tenant;
              return (
                <li key={t.id}>
                  <button className={`inbox-item ${isOpen ? "active" : ""}`} onClick={() => setOpen(t)}>
                    <span className="inbox-top">
                      <strong>{t.propertyName}</strong>
                      {t.lastAt ? <time>{time(t.lastAt)}</time> : null}
                    </span>
                    <span className="inbox-who">
                      {t.role === "tenant" ? "Owner" : "Tenant"} {shortAddr(otherWallet)}
                      {sameAddr(t.tenant, account) || sameAddr(t.landlord, account) ? "" : " · other wallet"}
                    </span>
                    <span className="inbox-last">
                      {t.lastText ? (t.lastFrom && (sameAddr(t.lastFrom, t.role === "tenant" ? t.tenant : t.landlord) ? "You: " : "")) + t.lastText : "No messages yet"}
                    </span>
                    {t.unread && <span className="unread-dot" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="inbox-chat">
            {open ? (
              <ChatWindow conv={{ propertyId: open.propertyId, tenant: open.tenant, title: open.propertyName }} onClose={() => setOpen(null)} />
            ) : (
              <p className="chat-empty">Pick a conversation.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
