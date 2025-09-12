import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAnonId } from "../utils/anonId";
import { fetchRecentChats, saveRecentChat, deleteRecentChat } from "../utils/recentChats";
import { appendToThread, getThread, deleteThread } from "../utils/threadStore";
import AuthProfileButton from './AuthProfileButton';

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
import SidebarNewsFeed from "./SidebarNewsFeed";

// [4I] Helper: contextmenu voor Recente chats (verwijderen)
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
        {/* Toggle */}
        <div className={cx("h-14 flex items-center px-2", expanded ? "justify-end" : "justify-center")}> 
          <button
            type="button"
            onClick={onToggleSidebar}
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

          {/* Newsfeed zichtbaar bij uitgeklapt */}
          {feedOpen && expanded && (
            <div className="mt-2">
              <SidebarNewsFeed limit={3} />
            </div>
          )}

          {/* Recente chats — alleen tonen als uitgeklapt, zodat ingeklapt clean blijft */}
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
          {/* Linkerzijde: alleen titel, strak links uitgelijnd */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); loadChat?.(c.id); }}
            className="text-left min-w-0 flex-1"
            title={raw}
          >
            <div className="text-[13px] text-[#194297] truncate">{label}</div>
          </button>

          {/* Rechterzijde: 3-puntjes menu, valt niet over de tekst */}
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

        {/* Profiel onderaan */}
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
/* ---------------- Mobile Sidebar (off-canvas) ---------------- */
function MobileSidebar({ open, onClose, onNewChat, onToggleFeed, feedOpen }) {
  return (
    <div className={cx(
      "md:hidden fixed inset-0 z-50 transition-opacity",
      open ? "opacity-100" : "opacity-0 pointer-events-none"
    )}>
      {/* Scrim */}
      <div
        className={cx("absolute inset-0 bg-black/30 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        className={cx(
          "absolute left-0 top-0 h-full w-[86vw] max-w-[360px]",
          "bg-[#fbfbfd] text-[#1f2937] border-r border-[#e5e7eb]",
          "shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Zijmenu"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-[#eef1f6]">
          <div className="flex items-center gap-2 text-[#194297] font-semibold text-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            Menu
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md text-gray-500 hover:text-gray-700"
            aria-label="Sluiten"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Acties */}
        <nav className="px-2 py-2">
          <button
            type="button"
            onClick={() => { onNewChat?.(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[#194297] hover:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            <span className="text-[13px] font-medium">Nieuwe chat</span>
          </button>

          <button
            type="button"
            onClick={() => { onToggleFeed?.(); onClose(); }}
            className="mt-1 w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[#1f2937] hover:bg-gray-100"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10l12-5v14L3 14z" />
              <path d="M15 5l6-2v18l-6-2" />
            </svg>
            <span className="text-[13px]">Insights</span>
          </button>
        </nav>

        {/* Live feed */}
        {feedOpen && (
          <div className="px-3 pb-2">
            <SidebarNewsFeed limit={3} />
          </div>
        )}

        {/* Profiel onderaan */}
<div className="mt-auto absolute bottom-0 left-0 right-0 p-3 border-t border-[#eef1f6] bg-[#fbfbfd]">
  <AuthProfileButton />
</div>
      </aside>
    </div>
  );
}

/******************** Main ********************/
function BluelineChatpilotInner() {
  const loaded = typeof window !== "undefined" ? safeLoad() : { messageType: "Social Media", tone: "Formeel", profileKey: "default" };

  // Layout state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [feedOpen, setFeedOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState("chat"); // "chat" | "newsfeed"

  // [4B] STATE — Recente chats/threads
  const [recent, setRecent] = useState([]);
  const uidRef = useRef(null);
  const currentChatIdRef = useRef(null);

  // Chat state
  const [messageType, setMessageType] = useState(loaded.messageType || "Social Media");
  const tone = "Automatisch"; // geen UI-pills
  const [profileKey, setProfileKey] = useState(loaded.profileKey || "default");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [messages, setMessages] = useState([]);
  const [heroTitle, setHeroTitle] = useState(timeWord()); // dagdeel prefix
  const [heroSub, setHeroSub] = useState(SUB_ROTATIONS[0]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Send-button fade + 200ms hide delay
  const [showSend, setShowSend] = useState(false);
  const [showSendDelayed, setShowSendDelayed] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const copiedTimer = useRef(null);

  // Init hero + rotaties
  useEffect(() => {
    setMessages([{ role: "assistant", text: "__hero__", meta: { type: "System" } }]);
    const i = setInterval(() => {
      setHeroTitle(timeWord());
      setHeroSub(SUB_ROTATIONS[Math.floor(Math.random() * SUB_ROTATIONS.length)]);
    }, 7000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => { setShowSend(input.trim().length > 0); }, [input]);
  useEffect(() => { if (showSend) setShowSendDelayed(true); else { const t = setTimeout(() => setShowSendDelayed(false), 200); return () => clearTimeout(t); } }, [showSend]);
  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (inputRef.current) autoresizeTextarea(inputRef.current); return () => copiedTimer.current && clearTimeout(copiedTimer.current); }, []);
  useEffect(() => { safeSave({ messageType, tone, profileKey }); }, [messageType, tone, profileKey]);

  // Init anonId + recents + start chatId
  useEffect(() => {
    uidRef.current = getAnonId();
    setRecent(fetchRecentChats(uidRef.current));
    if (!currentChatIdRef.current) currentChatIdRef.current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  }, []);

  const onInputChange = (e) => { setInput(e.target.value); autoresizeTextarea(e.target); };

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = (input || "").trim();
    if (!trimmed) return;
    // verwijder hero zodra eerste user message komt
    setMessages((prev) => prev.filter((m) => m.text !== "__hero__"));
    setMessages((prev) => [...prev, { role: "user", text: trimmed, meta: { type: messageType, tone, profileKey } }]);
    setInput(""); if (inputRef.current) autoresizeTextarea(inputRef.current);
    setIsTyping(true);
    try {
      const r = await fetch("/.netlify/functions/generate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: trimmed, type: messageType, tone, profileKey }),
      });
      const data = await r.json();
      const reply = r.ok && data?.text ? data.text : generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [...prev, { role: "assistant", text: reply, meta: { type: messageType, tone, profileKey } }]);

      // Opslaan in thread + recents
      const chatId = currentChatIdRef.current;
      const uid = uidRef.current;
      appendToThread(uid, chatId, { role: "user", text: trimmed, ts: Date.now() });
      appendToThread(uid, chatId, { role: "assistant", text: reply, ts: Date.now() });
      const title = trimmed.replace(/\s+/g, " ").slice(0, 40) || "Chat";
      setRecent(saveRecentChat(uid, { id: chatId, title, lastMessageAt: Date.now() }));
    } catch {
      const reply = generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [...prev, { role: "assistant", text: reply, meta: { type: messageType, tone, profileKey } }]);
      const chatId = currentChatIdRef.current;
      const uid = uidRef.current;
      appendToThread(uid, chatId, { role: "user", text: trimmed, ts: Date.now() });
      appendToThread(uid, chatId, { role: "assistant", text: reply, ts: Date.now() });
      const title = trimmed.replace(/\s+/g, " ").slice(0, 40) || "Chat";
      setRecent(saveRecentChat(uid, { id: chatId, title, lastMessageAt: Date.now() }));
    } finally { setIsTyping(false); }
  }

  function handleCopied(id) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
  }

  const openNewsfeedMobile = () => { setMobileView("newsfeed"); setMobileMenuOpen(false); };
  const backToChatMobile = () => setMobileView("chat");

  function handleNewChat() {
    setMessages([{ role: "assistant", text: "__hero__", meta: { type: "System" } }]);
    setInput("");
    setIsTyping(false);
    currentChatIdRef.current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Recall & delete
  function loadChat(chatId) {
    const uid = uidRef.current;
    const thread = getThread(uid, chatId);
    if (!Array.isArray(thread) || !thread.length) return;
    currentChatIdRef.current = chatId;
    setMessages(thread);
  }
  function handleDeleteChat(chatId) {
    const uid = uidRef.current;
    deleteThread(uid, chatId);
    setRecent(deleteRecentChat(uid, chatId));
    if (currentChatIdRef.current === chatId) {
      currentChatIdRef.current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      setMessages([{ role: "assistant", text: "__hero__", meta: { type: "System" } }]);
    }
  }

  return (
    <div className="fixed inset-0 bg-white text-[#65676a]">
      {/* Desktop sidebar */}
      <AppSidebar
        open={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleFeed={() => setFeedOpen((v) => !v)}
        feedOpen={feedOpen}
        onNewChat={handleNewChat}
        recent={recent}
        loadChat={loadChat}
        onDeleteChat={handleDeleteChat}
      />

      {/* Handle wanneer sidebar dicht is (klein knopje aan linker bovenzijde) */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="hidden md:flex fixed left-0 top-3 h-8 w-8 rounded-r-full bg-white border border-gray-200 shadow-sm text-[#66676b] hover:text-[#194297] items-center justify-center"
          aria-label="Zijbalk tonen"
          title="Zijbalk tonen"
        >
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="currentColor">
            <circle cx="12" cy="8" r="1.25"/><circle cx="12" cy="16" r="1.25"/>
          </svg>
        </button>
      )}

      {/* Main column met linker marge wanneer sidebar (gedeeltelijk) zichtbaar is */}
      <div className={cx(
        "h-full flex flex-col transition-[margin] duration-300",
        sidebarOpen ? "md:ml-64" : "md:ml-14"
      )}>
        {/* Header: hamburger alleen mobiel */}
        <header className="h-14 flex items-center gap-2 px-3 border-b md:border-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden h-9 w-9 grid place-items-center rounded-md text-[#194297] hover:bg-gray-100"
            aria-label="Zijmenu openen"
          >
            <svg viewBox="0 0 24 24" className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
          <h1 className="text-[15px] md:text-base font-semibold text-[#194297]">Blueline Chatpilot</h1>
          <p className="hidden sm:block ml-3 text-sm text-[#66676b]">Jouw 24/7 assistent voor klantcontact</p>
        </header>

        {/* Mobile fullscreen Insights */}
        {mobileView === "newsfeed" && (
          <div className="md:hidden fixed inset-0 z-40 bg-white">
            <div className="h-14 border-b flex items-center px-3 gap-2">
              <button className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100" onClick={backToChatMobile} aria-label="Terug">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="text-sm font-semibold text-[#194297]">Insights</div>
            </div>
            <div className="p-3 space-y-3 overflow-y-auto h-[calc(100vh-56px)]">
              <SidebarNewsFeed limit={3} variant="full" />
            </div>
          </div>
        )}

        {/* Scrollable chat viewport */}
        <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto w-full max-w-[760px] px-4 md:px-5">
            {/* Hero greeting zolang er geen user-message is */}
            {!messages.some(m=>m.role === "user") ? (
              <div className="h-[calc(100vh-14rem)] flex flex-col items-center justify-center text-center select-none">
                <div className="translate-y-[-4vh] md:translate-y-[-6vh]">
                  <div className="text-3xl md:text-4xl font-semibold text-[#194297]">{heroTitle}</div>
                  <div className="mt-2 text-sm text-[#66676b]">{heroSub}</div>
                </div>
              </div>
            ) : (
              <div className="py-5 flex flex-col gap-5" ref={listRef} role="log" aria-live="polite">
                {messages.filter(m=>m.text !== "__hero__").map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={idx} className={cx("flex", isUser ? "justify-end" : "justify-start")}> 
                      <div className={cx(
                        "max-w-[560px] rounded-2xl px-5 py-4 text-[15px] leading-6 break-words",
                        isUser
                          ? "bg-[#2563eb] text-white"
                          : "bg-white text-[#65676a] border border-gray-200 shadow-[0_6px_18px_rgba(25,66,151,0.08)]"
                      )}>{m.text}</div>
                      {!isUser && (
                        <div className="-mt-1 ml-2 self-end"> 
                          <CopyButton id={`msg-${idx}`} text={m.text} onCopied={handleCopied} isCopied={copiedId === `msg-${idx}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="max-w-[560px] rounded-2xl px-5 py-4 text-[15px] leading-6 bg-white text-[#65676a] border border-gray-200 shadow-[0_6px_18px_rgba(25,66,151,0.08)]">
                      <span className="relative inline-block w-6 h-2 align-middle">
                        <span className="absolute left-0 top-0 w-1.5 h-1.5 rounded-full bg-[#66676b] animate-bounce [animation-delay:-0.2s]"/>
                        <span className="absolute left-2 top-0 w-1.5 h-1.5 rounded-full bg-[#66676b] animate-bounce"/>
                        <span className="absolute left-4 top-0 w-1.5 h-1.5 rounded-full bg-[#66676b] animate-bounce [animation-delay:0.2s]"/>
                      </span>
                      <span className="ml-2">Typen…</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Dock (alleen input-blok) — GEEN extra scheidingslijn meer erboven */}
        <div className="bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <form onSubmit={handleSend} className="mx-auto max-w-[760px] px-4 md:px-5 py-3">
            <div className="relative rounded-2xl border border-gray-200 bg-white">
              {/* textarea */}
              <div className="px-4 pt-3 pb-10">
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
            </div>
          </form>

          {/* Disclaimer */}
          <div className="text-center text-[12px] text-[#66676b] pb-3">Chatpilot kan fouten maken. Controleer belangrijke informatie.</div>
        </div>
      </div>

      {/* Mobile off-canvas sidebar */}
      <MobileSidebar
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onNewChat={() => {
          inputRef?.current?.focus?.();
          setMobileMenuOpen(false);
        }}
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
