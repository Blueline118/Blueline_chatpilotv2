// change: deterministic gate for Members link; removed PermissionGate wrapper
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { getAnonId } from "../utils/anonId";
import { fetchRecentChats, saveRecentChat, deleteRecentChat } from "../utils/recentChats";
import { appendToThread, getThread, deleteThread } from "../utils/threadStore";

import AuthProfileButton from './AuthProfileButton';
import MembersAdmin from './MembersAdmin';
import SidebarNewsFeed from "./SidebarNewsFeed";
import { useAuth } from '../providers/AuthProvider';

/******************** Utils ********************/
const cx = (...args) => args.filter(Boolean).join(" ");

function autoresizeTextarea(el) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = Math.min(el.scrollHeight, 220) + "px"; // cap height
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    return true;
  } catch {
    return false;
  }
}

const LS_KEY = "blueline.chatpilot.state.v5";
function safeLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function safeSave(obj) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
  } catch {}
}

/* Dagdeel + roterende subteksten (geen naam) */
const SUB_ROTATIONS = [
  "Ik help je met snelle, klantvriendelijke antwoorden.",
  "Samen lossen we cases sneller op.",
  "Direct duidelijk, altijd menselijk.",
  "Klaar voor empathische support?",
  "Even sparren over je antwoord?",
];
function timeWord() {
  const h = new Date().getHours();
  if (h >= 22 || h < 6) return "Hallo"; // nacht → neutraal
  if (h < 12) return "Goedemorgen";
  if (h < 18) return "Goedemiddag";
  return "Goedenavond";
}

function extractOrderNumber(s) {
  if (!s) return null;
  const m = String(s).match(/#?(\d{4,})/);
  return m ? m[1] : null;
}

/* Fallback reply als de server niet kan antwoorden */
function generateAssistantReply(text, type, tone) {
  const lc = (text || "").toLowerCase();
  const neg = [
    "boos","slecht","belachelijk","klacht","niet ontvangen","vertraagd","kapot","beschadigd","annuleren","terugbetalen","refund",
  ].some(w=>lc.includes(w));
  const urg = ["dringend","met spoed","urgent","nu","direct","zo snel mogelijk"].some(w=>lc.includes(w));
  const autoTone = tone === "Automatisch" ? (neg || urg ? "Formeel" : "Informeel") : tone;
  const isEmail = type === "E-mail";
  const orderNo = extractOrderNumber(text);
  if (isEmail) {
    if (autoTone === "Formeel") {
      return `Geachte [Naam],\n\nDank voor uw bericht. We nemen dit direct in behandeling. Kunt u het ordernummer${orderNo?` (#${orderNo})`:""} en uw postcode delen (en bij schade een foto)? Dan controleren wij de status en koppelen we binnen 1 werkdag terug.\n\nMet vriendelijke groet,\nBlueline Customer Care`;
    }
    return `Hoi [Naam],\n\nThanks voor je bericht! Stuur je ordernummer${orderNo?` (#${orderNo})`:""} en postcode even mee (en bij schade een foto)? Dan checken we het direct en kom ik vandaag nog bij je terug.\n\nGroet,\nBlueline Customer Care`;
  }
  if (autoTone === "Formeel") {
    return `Dank voor uw bericht. Kunt u uw ordernummer${orderNo?` (#${orderNo})`:""} en postcode delen (en bij schade een foto)? Dan controleren wij direct de status en koppelen we terug met een update.`;
  }
  return `Thanks voor je bericht! Stuur je ordernummer${orderNo?` (#${orderNo})`:""} en je postcode even mee (en bij schade een foto)? Dan check ik het direct en krijg je snel een update 🙂`;
}

/******************** Kleine UI Bits ********************/
function CopyButton({ id, text, onCopied, isCopied }) {
  return (
    <button
      type="button"
      onClick={async () => { const ok = await copyToClipboard(text || ""); if (ok) onCopied?.(id); }}
      className={cx(
        "inline-flex items-center gap-1 text-[11px] transition-colors select-none",
        isCopied ? "text-emerald-600" : "text-[#65676a] hover:text-[#194297]"
      )}
      aria-label={isCopied ? "Gekopieerd" : "Kopieer bericht"}
      title={isCopied ? "Gekopieerd" : "Kopieer bericht"}
    >
      {isCopied ? (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true"><path d="M9 16.2l-3.5-3.5a1 1 0 10-1.4 1.4l4.2 4.2a1 1 0 001.4 0l10-10a1 1 0 10-1.4-1.4L9 16.2z"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true"><path d="M16 1H6a2 2 0 00-2 2v12h2V3h10V1zm3 4H10a2 2 0 00-2 2v14a2 2 0 002 2h9a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H10V7h9v14z"/></svg>
      )}
      <span>{isCopied ? "Gekopieerd" : "Kopieer"}</span>
    </button>
  );
}

/******************** Members nav item ********************/
function MembersNavItem() {
  const { roleForActiveOrg, activeOrgId, hasPermission } = useAuth();
  const [canMembers, setCanMembers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!activeOrgId || roleForActiveOrg === 'ADMIN') {
      setCanMembers(false);
      return () => {
        cancelled = true;
      };
    }

    setCanMembers(false);

    hasPermission(activeOrgId, 'members.read')
      .then((result) => {
        if (!cancelled) {
          setCanMembers(Boolean(result));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanMembers(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, hasPermission, roleForActiveOrg]);

  const showMembers = roleForActiveOrg === 'ADMIN' || canMembers;

  if (!showMembers) return null;

  return (
    <NavLink to="/app/members" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition">
      <span>Ledenbeheer</span>
    </NavLink>
  );
}

/******************** Sidebar (desktop) ********************/
function RecentChatMenu({ chatId, onDelete }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const btnRef = React.useRef(null);
  const idRef = React.useRef(Symbol("recent-menu"));

  // Sluit wanneer een ander menu opent
  React.useEffect(() => {
    function onAnyOpen(ev) {
      if (ev?.detail !== idRef.current) setOpen(false);
    }
    window.addEventListener("recent-menu-open", onAnyOpen);
    return () => window.removeEventListener("recent-menu-open", onAnyOpen);
  }, []);

  // Buiten klik sluit het menu
  React.useEffect(() => {
    function close() { setOpen(false); }
    if (open) document.addEventListener("click", close, { once: true });
    return () => document.removeEventListener("click", close);
  }, [open]);

  // Plaats menu naast de knop (portal + fixed)
  React.useEffect(() => {
    if (!open || !btnRef.current) return;
    function place() {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.top - 4, left: r.right + 8 });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Meer opties"
        title="Meer opties"
        className="text-[#65676a] hover:text-[#194297]"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          window.dispatchEvent(new CustomEvent("recent-menu-open", { detail: idRef.current }));
        }}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && createPortal(
        <div
          className="z-[9999] w-40 rounded-lg border border-gray-200 bg-white shadow-xl"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-gray-100 text-red-600"
            onClick={() => { setOpen(false); onDelete?.(chatId); }}
          >
            {/* rood prullenbak-icoon */}
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/>
            </svg>
            Verwijderen
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

function AppSidebar({ open, onToggleSidebar, onToggleFeed, feedOpen, onNewChat, recent = [], loadChat, onDeleteChat }) {
  const expanded = !!open;
  const sidebarWidth = expanded ? 256 : 56;

  // Tooltip (fixed gepositioneerd: geen horizontale scrollbar)
  const [tip, setTip] = React.useState({ text: "", x: 0, y: 0, show: false });
  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: r.right + 8, y: r.top + r.height / 2, show: true });
  }
  function hideTip() { setTip((t) => ({ ...t, show: false })); }

  // Klik op Insights: als ingeklapt → eerst uitklappen, dán feed tonen
  function handleInsightsClick() {
    if (!expanded) onToggleSidebar?.();
    onToggleFeed?.();
  }

  return (
    <>
      <aside
        className={cx(
          "hidden md:flex fixed inset-y-0 left-0 z-30",
          "bg-[#f7f8fa] border-r border-gray-200 shadow-sm",
          "flex-col transition-[width] duration-300 ease-out"
        )}
        style={{ width: sidebarWidth }}
        aria-expanded={expanded}
      >
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {/* Toggle button */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className={cx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors",
              expanded ? "justify-start text-[#66676b] hover:bg-gray-100" : "justify-center text-[#66676b] hover:bg-gray-100"
            )}
            aria-expanded={expanded}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 19V9"/><path d="M15 19V5"/><path d="M9 19v-6"/><path d="M3 19v-2"/>
            </svg>
            {expanded && <span className="whitespace-nowrap">Sidebar {expanded ? "inklappen" : "uitklappen"}</span>}
          </button>

          {/* Nieuwe chat */}
          <div className="relative">
            <button
              type="button"
              onClick={onNewChat}
              onMouseEnter={(e) => !expanded && showTip(e, "Nieuwe chat")}
              onMouseLeave={hideTip}
              className={cx(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] hover:bg-gray-100",
                expanded ? "text-[#194297] justify-start" : "text-[#66676b] justify-center"
              )}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
              </svg>
              {expanded && <span className="whitespace-nowrap">Nieuwe chat</span>}
            </button>
          </div>

          {/* Insights */}
          <div className="relative">
            <button
              type="button"
              onClick={handleInsightsClick}
              onMouseEnter={(e) => !expanded && showTip(e, "Insights")}
              onMouseLeave={hideTip}
              className={cx(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] hover:bg-gray-100",
                expanded ? "text-[#65676a] justify-start" : "text-[#66676b] justify-center"
              )}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10l12-5v14L3 14z"/><path d="M15 5l6-2v18l-6-2"/>
              </svg>
              {expanded && <span className="whitespace-nowrap">Insights</span>}
            </button>
          </div>

          {/* --- Ledenbeheer --- */}
          <MembersNavItem />

          {/* Newsfeed bij uitgeklapt */}
          {feedOpen && expanded && (
            <div className="mt-2">
              <SidebarNewsFeed limit={3} />
            </div>
          )}

          {/* Recente chats */}
          {expanded && (
            <div className="mt-2">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-[#66676b]">Recente chats</div>
              <ul className="px-2 space-y-1">
                {(Array.isArray(recent) ? recent.slice(0, 5) : []).map((c) => {
                  const raw = (c.title || "Chat").toString().trim();
                  const label = raw.length > 23 ? raw.slice(0, 23) + "…" : raw;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); loadChat?.(c.id); }}
                          className="text-left min-w-0 flex-1"
                          title={raw}
                        >
                          <div className="text-[13px] text-[#194297] truncate">{label}</div>
                          <div className="text-[11px] text-[#66676b] truncate">{new Date(c.updatedAt || c.createdAt || Date.now()).toLocaleString()}</div>
                        </button>
                        <RecentChatMenu chatId={c.id} onDelete={onDeleteChat} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Tooltip */}
        {tip.show && !expanded && createPortal(
          <div
            className="fixed z-[2000] pointer-events-none rounded-md bg-[#194297] text-white text-[12px] px-2 py-1 shadow-lg"
            style={{ top: tip.y, left: tip.x, transform: "translateY(-50%)" }}
          >
            {tip.text}
          </div>,
          document.body
        )}
      </aside>
    </>
  );
}

/******************** Mobile sidebar ********************/
function MobileSidebar({ open, onClose, onNewChat, onToggleFeed, feedOpen }) {
  const overlayRef = React.useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    function onClick(e) {
      if (e.target === overlayRef.current) onClose?.();
    }
    if (open) {
      overlayRef.current?.addEventListener("click", onClick);
    }
    return () => overlayRef.current?.removeEventListener("click", onClick);
  }, [open, onClose]);

  return createPortal(
    <div
      ref={overlayRef}
      className={cx(
        "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      <aside
        className={cx(
          "absolute inset-y-0 left-0 w-72 bg-white shadow-xl border-r border-gray-200",
          "transform transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#194297]">Menu</h2>
            <button type="button" className="text-[#66676b]" onClick={onClose} aria-label="Sluiten">
              <svg viewBox="0 0 24 24" className="w-5 h-5" stroke="currentColor" fill="none" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => { onNewChat?.(); onClose?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] bg-[#194297] text-white"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            <span className="whitespace-nowrap">Nieuwe chat</span>
          </button>

          <button
            type="button"
            onClick={() => { onToggleFeed?.(); onClose?.(); }}
            className={cx(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px]",
              feedOpen ? "bg-[#e8efff] text-[#194297]" : "text-[#66676b] hover:bg-gray-100"
            )}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 10l12-5v14L3 14z"/><path d="M15 5l6-2v18l-6-2"/>
            </svg>
            <span className="whitespace-nowrap">Insights</span>
          </button>

          <NavLink
            to="/app/members"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[#66676b] hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
              <path
                fill="currentColor"
                d="M16 13a4 4 0 1 0-4-4a4 4 0 0 0 4 4m-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3m8 2c-2.67 0-8 1.34-8 4v 2h16v-2c0-2.66-5.33-4-8-4m-8-1c-3 0-9 1.5-9 4v2h6v-2c0-1.35.74-2.5 1.93-3.41A11.5 11.5 0 0 0 0 18h0"
              />
            </svg>
            <span className="whitespace-nowrap">Ledenbeheer</span>
          </NavLink>
        </div>
      </aside>
    </div>,
    document.body
  );
}

/******************** Chat layout ********************/
function BluelineChatpilotInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roleForActiveOrg, activeOrgId, hasPermission } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState("chat"); // "chat" | "newsfeed"

  const [recent, setRecent] = useState([]);
  const [messageType, setMessageType] = useState(safeLoad().messageType || "Social Media");
  const [tone, setTone] = useState(safeLoad().tone || "Automatisch");
  const [profileKey, setProfileKey] = useState(safeLoad().profileKey || "default");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [heroTitle, setHeroTitle] = useState(timeWord()); // dagdeel prefix
  const [heroSub, setHeroSub] = useState(SUB_ROTATIONS[0]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const copiedTimer = useRef(null);

  // Rotatie hero-sub
  useEffect(() => {
    const interval = setInterval(() => {
      setHeroSub((prev) => {
        const idx = SUB_ROTATIONS.indexOf(prev);
        const next = (idx + 1) % SUB_ROTATIONS.length;
        return SUB_ROTATIONS[next];
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Load recent
  useEffect(() => {
    fetchRecentChats().then(setRecent);
  }, []);

  // Load active chat from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const chatId = params.get("chat");
    if (!chatId) {
      setActiveChatId(null);
      setMessages([]);
      setInput("");
      return;
    }
    getThread(chatId).then((thread) => {
      if (thread) {
        setActiveChatId(chatId);
        setMessages(thread.messages || []);
        setMessageType(thread.meta?.messageType || "Social Media");
        setTone(thread.meta?.tone || "Automatisch");
        setProfileKey(thread.meta?.profileKey || "default");
      }
    });
  }, [location.search]);

  // Watch message input -> show send button
  const [showSend, setShowSend] = useState(false);
  const [showSendDelayed, setShowSendDelayed] = useState(false);
  useEffect(() => { setShowSend(input.trim().length > 0); }, [input]);
  useEffect(() => { if (showSend) setShowSendDelayed(true); else { const t = setTimeout(() => setShowSendDelayed(false), 200); return () => clearTimeout(t); } }, [showSend]);
  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (inputRef.current) autoresizeTextarea(inputRef.current); return () => copiedTimer.current && clearTimeout(copiedTimer.current); }, []);
  useEffect(() => { safeSave({ messageType, tone, profileKey }); }, [messageType, tone, profileKey]);

  useEffect(() => {
    const key = activeChatId;
    if (!key) return;
    saveRecentChat(key, {
      id: key,
      title: messages[0]?.content?.slice(0, 40) || "Chat",
      updatedAt: Date.now(),
    }).then(fetchRecentChats).then(setRecent);
  }, [messages, activeChatId]);

  function handleNewChat() {
    const newId = crypto.randomUUID();
    setActiveChatId(newId);
    setMessages([]);
    setInput("");
    setMessageType("Social Media");
    setTone("Automatisch");
    setProfileKey("default");
    navigate(`?chat=${newId}`);
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };

    const fakeAssistant = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: generateAssistantReply(trimmed, messageType, tone),
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, fakeAssistant]);
    setInput("");
    setIsTyping(false);
    setHeroTitle(timeWord());

    if (inputRef.current) {
      inputRef.current.style.height = "0px";
      inputRef.current.style.height = "52px";
    }

    const chatId = activeChatId || crypto.randomUUID();
    if (!activeChatId) {
      setActiveChatId(chatId);
      navigate(`?chat=${chatId}`, { replace: true });
    }

    appendToThread(chatId, {
      messages: [userMessage, fakeAssistant],
      meta: { messageType, tone, profileKey },
    });

    saveRecentChat(chatId, {
      id: chatId,
      title: trimmed.slice(0, 40),
      updatedAt: Date.now(),
    }).then(fetchRecentChats).then(setRecent);
  }

  async function handleDeleteChat(chatId) {
    await deleteThread(chatId);
    await deleteRecentChat(chatId);
    setRecent(await fetchRecentChats());
    if (activeChatId === chatId) {
      navigate(`?`, { replace: true });
      setActiveChatId(null);
      setMessages([]);
      setInput("");
    }
  }

  function onInputChange(e) {
    setInput(e.target.value);
    setIsTyping(e.target.value.trim().length > 0);
  }

  function onCopy(messageId, text) {
    setCopiedId(messageId);
    copyToClipboard(text);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
  }

  function openNewsfeedMobile() {
    setMobileView((prev) => prev === "chat" ? "newsfeed" : "chat");
  }

  const showMembersLink = roleForActiveOrg === 'ADMIN';
  const [canSeeMembers, setCanSeeMembers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!activeOrgId || roleForActiveOrg === 'ADMIN') {
      setCanSeeMembers(false);
      return () => {
        cancelled = true;
      };
    }

    setCanSeeMembers(false);

    hasPermission(activeOrgId, 'members.read').then((result) => {
      if (!cancelled) {
        setCanSeeMembers(Boolean(result));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, hasPermission, roleForActiveOrg]);

  return (
    <div className="min-h-screen bg-[#f2f5fb] flex">
      {/* Desktop sidebar */}
      <AppSidebar
        open={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleFeed={() => setFeedOpen((v) => !v)}
        feedOpen={feedOpen}
        onNewChat={handleNewChat}
        recent={recent}
        loadChat={(chatId) => navigate(`?chat=${chatId}`)}
        onDeleteChat={handleDeleteChat}
      />

      {/* Content */}
      <div className="flex-1 flex flex-col md:ml-[56px] lg:ml-[256px] transition-[margin] duration-300 ease-out">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              className="md:hidden text-[#194297]"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>

            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[#66676b]">Blueline Chatpilot</div>
              <div className="text-[18px] font-semibold text-[#194297] truncate">{heroTitle}</div>
              <div className="text-[13px] text-[#66676b] truncate">{heroSub}</div>
            </div>

            <div className="hidden md:flex items-center gap-3">
              {(showMembersLink || canSeeMembers) && (
                <NavLink
                  to="/app/members"
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] rounded-md border border-[#d6def3] text-[#194297] hover:bg-[#eef3ff]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0">
                    <path
                      fill="currentColor"
                      d="M16 13a4 4 0 1 0-4-4a4 4 0 0 0 4 4m-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3m8 2c-2.67 0-8 1.34-8 4v 2h16v-2c0-2.66-5.33-4-8-4m-8-1c-3 0-9 1.5-9 4v2h6v-2c0-1.35.74-2.5 1.93-3.41A11.5 11.5 0 0 0 0 18h0"
                    />
                  </svg>
                  <span>Ledenbeheer</span>
                </NavLink>
              )}

              <AuthProfileButton />
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-4 px-4 py-6">
            {/* Chat area */}
            <section className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm bg-[#eef3ff] text-[#194297]"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                  Nieuwe chat
                </button>

                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-[13px] text-[#66676b]">Type:</span>
                  <div className="inline-flex rounded-lg bg-[#f5f7fb] p-1">
                    {["Social Media", "E-mail"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMessageType(t)}
                        className={cx(
                          "px-3 py-1 text-[12px] rounded-md transition-colors",
                          messageType === t ? "bg-white text-[#194297] shadow-sm" : "text-[#66676b]"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-2">
                  <span className="text-[13px] text-[#66676b]">Toon:</span>
                  <div className="inline-flex rounded-lg bg-[#f5f7fb] p-1">
                    {["Automatisch", "Informeel", "Formeel"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t)}
                        className={cx(
                          "px-3 py-1 text-[12px] rounded-md transition-colors",
                          tone === t ? "bg-white text-[#194297] shadow-sm" : "text-[#66676b]"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ml-auto md:hidden">
                  <AuthProfileButton />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4" ref={listRef}>
                {messages.length === 0 ? (
                  <div className="text-center text-[#66676b] text-[14px]">
                    <div className="text-[16px] font-semibold text-[#194297] mb-2">Start een gesprek</div>
                    <p>Typ een vraag of plak een klantbericht, dan helpt Chatpilot je met een voorstel.</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cx(
                        "rounded-2xl px-4 py-3 max-w-[85%] shadow-sm border border-gray-100",
                        msg.role === "user" ? "ml-auto bg-[#eef3ff]" : "mr-auto bg-white"
                      )}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-[#66676b] mb-1">
                        {msg.role === "user" ? "Jij" : "Chatpilot"}
                      </div>
                      <div className="text-[14px] text-[#333] whitespace-pre-line leading-6">{msg.content}</div>

                      <div className="mt-2 flex items-center gap-3 text-[11px] text-[#66676b]">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {msg.role === "assistant" && (
                          <CopyButton
                            id={msg.id}
                            text={msg.content}
                            onCopied={(id) => onCopy(id, msg.content)}
                            isCopied={copiedId === msg.id}
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form
                className="border-t border-gray-100 bg-[#f9fbff] relative"
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              >
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={onInputChange}
                    placeholder="Typ een bericht..."
                    className="w-full resize-none outline-none placeholder:text-[#66676b] placeholder:text-[15px] text-[15px] leading-6"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  />
                </div>

                {/* onderregel: + (profiel), type toggles, mic + send */}
                <div className="absolute left-0 right-0 bottom-0 h-10 flex items-center">
                  {/* Links */}
                  <div className="pl-4 flex items-center gap-3 relative">
                    {/* plus */}
                    <button type="button" className="w-5 h-5 text-[#65676a] hover:text-[#194297]" aria-label="Meer" onClick={() => setProfileMenuOpen((v) => !v)}>
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                    </button>

                    {/* Profiel dropdown */}
                    {profileMenuOpen && (
                      <div className="absolute bottom-11 left-0 z-20 w-48 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                        {[{key:"default",label:"Standaard"},{key:"merrachi",label:"Merrachi"}].map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => { setProfileKey(p.key); setProfileMenuOpen(false); safeSave({ messageType, tone, profileKey: p.key }); }}
                            className={cx("block w-full text-left px-3 py-2 text-sm hover:bg-blue-50", profileKey === p.key && "font-semibold text-[#194297]")}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Type toggles */}
                    <div className="flex items-center gap-4 text-[14px]">
                      {["Social Media","E-mail"].map((t) => (
                        <button key={t} type="button" onClick={() => setMessageType(t)} className={cx("rounded-md px-2 py-1 transition-colors", messageType === t ? "text-[#194297] font-semibold" : "text-[#66676b] hover:bg-blue-50")}>{t}</button>
                      ))}
                    </div>
                  </div>

                  {/* Rechts */}
                  <div className="ml-auto pr-3 flex items-center gap-2">
                    {/* Mic (dummy) */}
                    <button type="button" className="hidden sm:inline-flex w-8 h-8 items-center justify-center rounded-full text-[#65676a] hover:bg-[#f2f8ff]" aria-label="Spraak">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z"/>
                        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
                        <path d="M12 19v3"/>
                      </svg>
                    </button>

                    {/* Send (fade + delay) */}
                    {showSendDelayed && (
                      <button type="submit" className={cx("w-8 h-8 rounded-full flex items-center justify-center bg-[#f2f8ff] text-[#194297] shadow transition-all duration-200", showSend ? "opacity-100 scale-100" : "opacity-0 scale-95")} aria-label="Versturen">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 2L11 13" />
                          <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </form>

              {/* Disclaimer */}
              <div className="text-center text-[12px] text-[#66676b] pb-3">Chatpilot kan fouten maken. Controleer belangrijke informatie.</div>
            </section>

            {/* Newsfeed */}
            <aside className={cx(
              "lg:w-80 flex-shrink-0 transition-transform duration-300 ease-out",
              feedOpen ? "translate-x-0" : "translate-x-[110%] lg:translate-x-0"
            )}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[#194297]">Nieuws & updates</h3>
                  <button
                    type="button"
                    className="text-[#66676b] hover:text-[#194297] lg:hidden"
                    onClick={() => setFeedOpen(false)}
                    aria-label="Sluiten"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <SidebarNewsFeed limit={5} />
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>

      {/* Mobile off-canvas sidebar */}
      <MobileSidebar
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onNewChat={() => { handleNewChat(); setMobileMenuOpen(false); }}
        onToggleFeed={openNewsfeedMobile}
        feedOpen={feedOpen}
      />
    </div>
  );
}

/******************** ErrorBoundary + Export ********************/
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(){ return { hasError: true }; }
  render(){
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold mb-2 text-[#194297]">Er ging iets mis</h2>
            <p className="text-[#66676b]">Ververs de pagina en probeer het opnieuw.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BluelineChatpilot(){
  return (
    <ErrorBoundary>
      <BluelineChatpilotInner />
    </ErrorBoundary>
  );
}
