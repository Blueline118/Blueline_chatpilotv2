// change: Members link visible only for authenticated ADMIN; removed blocking wrappers
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) {
              // vertel andere menus dat deze open gaat
              window.dispatchEvent(new CustomEvent("recent-menu-open", { detail: idRef.current }));
            }
            return next;
          });
        }}
        className="h-6 w-6 grid place-items-center rounded hover:bg-gray-200 text-[#66676b]"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
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

/* ... rest of file unchanged ... */

function SidebarTooltip({ show, text, position }) {
  if (!show) return null;
  return createPortal(
    <div
      className="fixed z-50 px-2 py-1 rounded-md text-[11px] leading-none bg-white border border-gray-200 shadow-sm text-[#194297]"
      style={{ left: position.x, top: position.y, transform: "translateY(-50%)" }}
    >
      {text}
    </div>,
    document.body
  );
}

function SidebarToggleButton({ expanded, onToggle }) {
  return (
    <div className={cx("h-14 flex items-center px-2", expanded ? "justify-end" : "justify-center")}>
      <button
        type="button"
        onClick={onToggle}
        className="h-6 w-6 rounded-md text-[#66676b] hover:text-[#194297] flex items-center justify-center"
        aria-label={expanded ? "Zijbalk verbergen" : "Zijbalk tonen"}
        title={expanded ? "Zijbalk verbergen" : "Zijbalk tonen"}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
      </button>
    </div>
  );
}

function AppSidebar({ open, onToggleSidebar, onToggleFeed, feedOpen, onNewChat, recent = [], loadChat, onDeleteChat }) {
  const expanded = !!open;
  const sidebarWidth = expanded ? 256 : 56;

  const { roleForActiveOrg, activeOrgId, hasPermission } = useAuth();
  const isAdmin = roleForActiveOrg === 'ADMIN';
  const [membersGateReady, setMembersGateReady] = React.useState(false);
  const [canSeeMembers, setCanSeeMembers] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    if (!isAdmin || !activeOrgId) {
      setCanSeeMembers(false);
      setMembersGateReady(true);
      return () => {
        cancelled = true;
      };
    }

    setMembersGateReady(false);
    hasPermission(activeOrgId, 'members.read').then((result) => {
      if (cancelled) return;
      setCanSeeMembers(Boolean(result));
      setMembersGateReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, hasPermission, isAdmin]);

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
        {/* Toggle */}
        <SidebarToggleButton expanded={expanded} onToggle={onToggleSidebar} />

        <nav className="relative flex-1 overflow-y-auto px-2 pb-3 space-y-1">
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
                  <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
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

          {/* --- Ledenbeheer (alleen zichtbaar voor admins) --- */}
          <NavLink
            to="/app/members"
            title="Ledenbeheer"
            className={({ isActive }) => [
              "group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
              expanded ? "justify-start" : "justify-center",
              isActive
                ? "bg-[#e8efff] text-[#194297]"
                : "text-[#66676b] hover:bg-[#f3f6ff] hover:text-[#194297]",
            ].join(' ')}
          >
            {/* people/users icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
              <path
                fill="currentColor"
                d="M16 13a4 4 0 1 0-4-4a4 4 0 0 0 4 4m-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3m8 2c-2.67 0-8 1.34-8 4v 2h16v-2c0-2.66-5.33-4-8-4m-8-1c-3 0-9 1.5-9 4v2h6v-2c0-1.35.74-2.5 1.93-3.41A11.5 11.5 0 0 0 0 18h0"
              />
            </svg>
            {expanded && <span className="text-[14px] font-medium">Ledenbeheer</span>}
          </NavLink>

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
                        </button>
                        <div className="ml-2 flex-shrink-0 relative">
                          <RecentChatMenu chatId={c.id} onDelete={onDeleteChat} />
                        </div>
                      </div>
                    </li>
                  );
                })}
                {!recent?.length && (
                  <li className="px-3 py-2 text-[12px] text-[#66676b]">Nog geen gesprekken</li>
                )}
              </ul>
            </div>
          )}
        </nav>

        {/* Profiel onderaan (desktop sidebar) */}
        <div className="mt-auto p-3 border-t border-gray-200">
          <AuthProfileButton expanded={expanded} />
        </div>
      </aside>

      {/* Tooltip renderer (fixed): subtiel en klein maar leesbaar */}
      {tip.show && !expanded && (
        <div
          className="fixed z-50 px-2 py-1 rounded-md text-[11px] leading-none bg-white border border-gray-200 shadow-sm text-[#194297]"
          style={{ left: tip.x, top: tip.y, transform: "translateY(-50%)" }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}

/******************** Mobile Drawer (hamburger) ********************/
function MobileSidebar({ open, onClose, onNewChat, onToggleFeed, feedOpen }) {
  const { roleForActiveOrg } = useAuth();
  const expanded = true;
  const links = [
    {
      label: "Nieuwe chat",
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
      ),
      action: () => { onNewChat?.(); onClose?.(); }
    },
    {
      label: "Insights",
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10l12-5v14L3 14z"/><path d="M15 5l6-2v18l-6-2"/>
        </svg>
      ),
      action: () => { onToggleFeed?.(); onClose?.(); }
    },
    roleForActiveOrg === 'ADMIN' && {
      label: "Ledenbeheer",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
          <path
            fill="currentColor"
            d="M16 13a4 4 0 1 0-4-4a4 4 0 0 0 4 4m-8 0a3 3 0 1 0-3-3a3 3 0 0 0 3 3m8 2c-2.67 0-8 1.34-8 4v 2h16v-2c0-2.66-5.33-4-8-4m-8-1c-3 0-9 1.5-9 4v2h6v-2c0-1.35.74-2.5 1.93-3.41A11.5 11.5 0 0 0 0 18h0"
          />
        </svg>
      ),
      to: "/app/members"
    }
  ].filter(Boolean);

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-40 transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      <div
        className={cx(
          "absolute inset-0 bg-black/20 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cx(
          "absolute inset-y-0 left-0 w-72 max-w-full bg-white shadow-xl transition-transform",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="text-[15px] font-semibold text-[#194297]">Menu</div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full text-[#66676b] hover:bg-gray-100"
            aria-label="Sluiten"
            title="Sluiten"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {links.map((link, index) => {
            if (link.to) {
              return (
                <NavLink
                  key={index}
                  to={link.to}
                  onClick={onClose}
                  className={({ isActive }) => [
                    "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors",
                    isActive ? "bg-[#e8efff] text-[#194297]" : "text-[#66676b] hover:bg-[#f3f6ff] hover:text-[#194297]",
                  ].join(' ')}
                >
                  {link.icon}
                  <span className="text-[14px] font-medium">{link.label}</span>
                </NavLink>
              );
            }
            return (
              <button
                key={index}
                type="button"
                onClick={link.action}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] text-[#66676b] hover:bg-[#f3f6ff] hover:text-[#194297]"
              >
                {link.icon}
                <span className="font-medium">{link.label}</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-gray-200 p-3">
          <AuthProfileButton expanded={expanded} />
        </div>
      </div>
    </div>,
    document.body
  );
}

/******************** Main Component ********************/
function BluelineChatpilotInner() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tone, setTone] = useState("Automatisch");
  const [messageType, setMessageType] = useState("Social Media");
  const [profileKey, setProfileKey] = useState("default");
  const [tooltip, setTooltip] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [showSend, setShowSend] = useState(false);
  const [showSendDelayed, setShowSendDelayed] = useState(false);
  const [isCopiedMap, setIsCopiedMap] = useState({});
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newsfeedDrawerOpen, setNewsfeedDrawerOpen] = useState(false);

  const { activeOrgId, profile } = useAuth();

  const textareaRef = useRef(null);
  const replyRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => setShowSendDelayed(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSendDelayed) return;
    const timer = setTimeout(() => setShowSend(true), 50);
    return () => clearTimeout(timer);
  }, [showSendDelayed]);

  useEffect(() => {
    const saved = safeLoad();
    if (saved.messageType) setMessageType(saved.messageType);
    if (saved.tone) setTone(saved.tone);
    if (saved.profileKey) setProfileKey(saved.profileKey);
  }, []);

  useEffect(() => {
    const saved = safeLoad();
    if (saved.currentChatId) {
      loadChat(saved.currentChatId);
    } else {
      setCurrentChatId(null);
      setHistory([]);
      setReply("");
      setInput("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      const list = await fetchRecentChats();
      if (!cancelled) setRecentChats(list);
    }
    loadRecent();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!threadId) return;
    const el = replyRef.current;
    if (el) {
      const observer = new MutationObserver(() => {
        el.scrollTop = el.scrollHeight;
      });
      observer.observe(el, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
  }, [threadId]);

  useEffect(() => {
    autoresizeTextarea(textareaRef.current);
  }, [input]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        handleSend();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function openNewsfeedMobile() {
    setNewsfeedDrawerOpen(true);
  }

  function closeNewsfeedMobile() {
    setNewsfeedDrawerOpen(false);
  }

  function showTooltip(e, text) {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }

  function hideTooltip() {
    setTooltip(null);
  }

  function handleNewChat() {
    setCurrentChatId(null);
    setThreadId(null);
    setHistory([]);
    setReply("");
    setInput("");
    setIsCopiedMap({});
    safeSave({ messageType, tone, profileKey, currentChatId: null });
  }

  async function loadChat(id) {
    if (!id) return;
    const thread = await getThread(id);
    if (!thread) return;

    setCurrentChatId(id);
    setThreadId(id);
    setHistory(thread.history || []);
    setReply(thread.reply || "");
    setInput(thread.input || "");
    setIsCopiedMap({});
    safeSave({ messageType, tone, profileKey, currentChatId: id });
  }

  async function handleSaveChat(id, data) {
    setSaving(true);
    try {
      await saveRecentChat(id, data);
      setRecentChats(await fetchRecentChats());
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteChat(id) {
    await deleteRecentChat(id);
    setRecentChats(await fetchRecentChats());
    if (currentChatId === id) {
      handleNewChat();
    }
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const newHistory = [...history, { role: "user", content: input }];
    setHistory(newHistory);
    setLoading(true);
    setReply("");
    setIsCopiedMap((prev) => ({ ...prev, assistant: false }));

    const anonId = await getAnonId();
    const requestBody = {
      input,
      history: newHistory,
      tone,
      messageType,
      profile: profileKey,
      anonId,
      organizationId: activeOrgId,
      userEmail: profile?.email,
    };

    let newReply = "";
    try {
      const response = await fetch("/.netlify/functions/chatpilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error("Failed to fetch");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value || new Uint8Array(), { stream: !done });
        newReply += chunk;
        setReply((prev) => prev + chunk);
      }

      setHistory((prev) => [...prev, { role: "assistant", content: newReply }]);

      const newThreadId = threadId || Date.now().toString(36);
      setThreadId(newThreadId);

      await appendToThread(newThreadId, {
        input,
        history: newHistory,
        reply: newReply,
        tone,
        messageType,
        profileKey,
      });

      safeSave({ messageType, tone, profileKey, currentChatId: newThreadId });
      setCurrentChatId(newThreadId);

      await handleSaveChat(newThreadId, {
        id: newThreadId,
        title: input.slice(0, 80) || "Nieuwe chat",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      const fallback = generateAssistantReply(input, messageType, tone);
      setReply(fallback);
      setHistory((prev) => [...prev, { role: "assistant", content: fallback }]);
    } finally {
      setLoading(false);
      setInput("");
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
  }

  function handleToneChange(value) {
    setTone(value);
    safeSave({ messageType, tone: value, profileKey, currentChatId });
  }

  function handleMessageTypeChange(value) {
    setMessageType(value);
    safeSave({ messageType: value, tone, profileKey, currentChatId });
  }

  function handleCopy(id, text) {
    setIsCopiedMap((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setIsCopiedMap((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  }

  function handleDeleteThread(id) {
    deleteThread(id);
    setRecentChats((prev) => prev.filter((chat) => chat.id !== id));
    if (currentChatId === id) {
      handleNewChat();
    }
  }

  const toneOptions = ["Automatisch", "Formeel", "Informeel"];
  const messageTypes = ["Social Media", "E-mail"];

  return (
    <div className="relative min-h-screen bg-white">
      {/* Desktop layout */}
      <div className="md:pl-[256px]">
        <AppSidebar
          open={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onToggleFeed={() => setFeedOpen((prev) => !prev)}
          feedOpen={feedOpen}
          onNewChat={handleNewChat}
          recent={recentChats}
          loadChat={loadChat}
          onDeleteChat={handleDeleteChat}
        />

        <main className="min-h-screen">
          <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-4 h-14">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="md:hidden h-8 w-8 flex items-center justify-center rounded-full text-[#66676b] hover:bg-gray-100"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Menu"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>
                  </svg>
                </button>
                <div className="text-[15px] font-semibold text-[#194297]">Blueline Chatpilot</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseEnter={(e) => showTooltip(e, "Nieuwsfeed")}
                  onMouseLeave={hideTooltip}
                  className={cx(
                    "hidden md:inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
                    feedOpen ? "bg-[#e8efff] text-[#194297]" : "text-[#66676b] hover:bg-[#f3f6ff]"
                  )}
                  onClick={() => setFeedOpen((prev) => !prev)}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h6"/>
                  </svg>
                  Nieuwsfeed
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/app/settings")}
                  onMouseEnter={(e) => showTooltip(e, "Instellingen")}
                  onMouseLeave={hideTooltip}
                  className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-full text-[#66676b] hover:bg-gray-100"
                  aria-label="Instellingen"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 max-w-3xl mx-auto">
            <div className="bg-[#f7f8fa] rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="text-[14px] font-medium text-[#194297]">Chat</div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProfileMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] text-[#66676b] hover:bg-[#f3f6ff]"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                        <path d="M21 20a9 9 0 1 0-18 0"/>
                      </svg>
                      Profielen
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </button>

                    {profileMenuOpen && (
                      <div className="absolute right-0 mt-2 w-44 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-10">
                        {[{key:"default",label:"Standaard"},{key:"merrachi",label:"Merrachi"}].map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => { setProfileKey(p.key); setProfileMenuOpen(false); safeSave({ messageType, tone, profileKey: p.key, currentChatId }); }}
                            className={cx("block w-full text-left px-3 py-2 text-sm hover:bg-blue-50", profileKey === p.key && "font-semibold text-[#194297]")}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setTone((prev) => {
                        const currentIndex = toneOptions.indexOf(prev);
                        const nextIndex = (currentIndex + 1) % toneOptions.length;
                        const next = toneOptions[nextIndex];
                        handleToneChange(next);
                        return next;
                      })}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] text-[#66676b] hover:bg-[#f3f6ff]"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 21v-7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7"/>
                        <path d="M12 3a4 4 0 0 1 4 4v1H8V7a4 4 0 0 1 4-4z"/>
                      </svg>
                      {tone}
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-4 py-6 space-y-6">
                <div className="space-y-4">
                  {history.map((entry, idx) => (
                    <div
                      key={idx}
                      className={cx(
                        "relative rounded-2xl px-4 py-3 text-[14px]",
                        entry.role === "assistant" ? "bg-white border border-gray-200 shadow-sm text-[#194297]" : "bg-[#194297] text-white"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cx(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold",
                          entry.role === "assistant" ? "bg-[#e8efff] text-[#194297]" : "bg-white/20 text-white"
                        )}>
                          {entry.role === "assistant" ? "AI" : "JIJ"}
                        </div>
                        <div className="flex-1 whitespace-pre-wrap leading-6">{entry.content}</div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <CopyButton
                          id={`${idx}-${entry.role}`}
                          text={entry.content}
                          onCopied={handleCopy}
                          isCopied={isCopiedMap[`${idx}-${entry.role}`]}
                        />
                      </div>
                    </div>
                  ))}

                  {reply && (
                    <div className="relative rounded-2xl px-4 py-3 bg-white border border-gray-200 shadow-sm text-[#194297] text-[14px]">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#e8efff] text-[#194297] flex items-center justify-center text-[13px] font-semibold">
                          AI
                        </div>
                        <div className="flex-1 whitespace-pre-wrap leading-6" ref={replyRef}>{reply}</div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <CopyButton
                          id="assistant"
                          text={reply}
                          onCopied={handleCopy}
                          isCopied={isCopiedMap.assistant}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="relative"
                >
                  <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-12">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={handleInputChange}
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
                            <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
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
                  </div>
                </form>

                {/* Disclaimer */}
                <div className="text-center text-[12px] text-[#66676b] pb-3">Chatpilot kan fouten maken. Controleer belangrijke informatie.</div>
              </div>
            </div>
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

      {/* Mobile newsfeed drawer */}
      {newsfeedDrawerOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/20" onClick={closeNewsfeedMobile} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-[15px] font-semibold text-[#194297]">Nieuwsfeed</div>
              <button
                type="button"
                onClick={closeNewsfeedMobile}
                className="h-8 w-8 flex items-center justify-center rounded-full text-[#66676b] hover:bg-gray-100"
                aria-label="Sluiten"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <SidebarNewsFeed limit={10} />
            </div>
          </div>
        </div>
      )}

      {tooltip && (
        <SidebarTooltip show={!!tooltip} text={tooltip.text} position={{ x: tooltip.x, y: tooltip.y }} />
      )}
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
