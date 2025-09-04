import React, { useEffect, useRef, useState } from "react";

/******************** Utils ********************/
const cx = (...args) => args.filter(Boolean).join(" ");

function autoresizeTextarea(el) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    return true;
  } catch {
    return false;
  }
}

const LS_KEY = "blueline.chatpilot.state.v1";
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
    const raw = JSON.stringify(obj || {});
    localStorage.setItem(LS_KEY, raw);
  } catch {}
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Goedemorgen! Klaar voor service met een glimlach?";
  if (h < 18) return "Goedemiddag! Tijd voor koffie én een goede klantcase.";
  return "Goedenavond! Vandaag al een klant verrast met extra service?";
}

function generateAssistantReply(text, type, tone) {
  return `Ik heb je bericht ontvangen. (${type}, ${tone})`;
}

function getSidebarItems() {
  return [
    { title: "Customer Care trend: AI hand-offs", summary: "Waarom dit relevant is voor supportteams.", source: "CX Today", date: "2025-08-31" },
    { title: "Retourbeleid optimaliseren", summary: "Best practices rond retouren.", source: "E-commerce NL", date: "2025-08-29" },
    { title: "Bezorging & transparency", summary: "Heldere updates verminderen druk.", source: "Logistiek Pro", date: "2025-08-27" },
  ];
}

/******************** Tiny UI Bits ********************/
function CopyButton({ id, text, onCopied, isCopied }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text || "");
        if (ok) onCopied?.(id);
      }}
      className={cx("inline-flex items-center gap-1 text-[11px] transition-colors select-none", isCopied ? "text-emerald-600" : "text-gray-500 hover:text-gray-700")}
      aria-label={isCopied ? "Gekopieerd" : "Kopieer bericht"}
      title={isCopied ? "Gekopieerd" : "Kopieer bericht"}
    >
      {isCopied ? "✔" : "⧉"} <span>{isCopied ? "Gekopieerd" : "Kopieer"}</span>
    </button>
  );
}

/******************** Desktop: vaste linker sidebar ********************/
function AppSidebar({ onToggleFeed, feedOpen }) {
  return (
    <aside
      className={cx(
        "hidden md:flex fixed left-0 top-0 bottom-0 z-30 w-64 border-r border-blue-100/70",
        "bg-gradient-to-b from-[#ECF4FF] via-[#F6FAFF] to-transparent"
      )}
      aria-label="Primair menu"
    >
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-blue-100/70">
          <div className="text-[15px] font-semibold text-[#2563eb]">Blueline Chatpilot</div>
          <p className="text-[11px] text-[#194297]">Jouw 24/7 assistent voor klantcontact</p>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto space-y-2">
          <button
            type="button"
            onClick={onToggleFeed}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/60 text-gray-700"
          >
            <span>📢 Nieuwsfeed</span>
            <span>{feedOpen ? "▾" : "▸"}</span>
          </button>
          {feedOpen && (
            <div className="ml-3 space-y-2 mt-2">
              {getSidebarItems().map((it, i) => (
                <div key={i} className="text-sm text-gray-700 border rounded-lg p-2 bg-white hover:bg-gray-50">
                  <div className="font-medium text-[#2563eb]">{it.title}</div>
                  <p className="text-xs text-gray-500">{it.summary}</p>
                </div>
              ))}
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}

/******************** Mobile: hamburger menu ********************/
function MobileDrawer({ open, onClose, onSelect }) {
  return (
    <div className={cx("md:hidden fixed inset-0 z-50 transition-opacity", open ? "opacity-100" : "opacity-0 pointer-events-none")}> 
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className={cx("absolute left-0 top-0 h-full w-[80%] max-w-xs bg-white shadow-xl p-4", open ? "translate-x-0" : "-translate-x-full", "transition-transform duration-300")}> 
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Menu</div>
          <button className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100" onClick={onClose} aria-label="Sluit">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100" onClick={() => { onSelect("newsfeed"); onClose(); }}>📢 Nieuwsfeed</button>
        <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100" onClick={() => { onSelect("chat"); onClose(); }}>💬 Chat</button>
      </div>
    </div>
  );
}

/******************** Main ********************/
function BluelineChatpilotInner() {
  const loaded = typeof window !== "undefined" ? safeLoad() : { messageType: "Social Media", tone: "Formeel", profileKey: "default" };

  // Layout state
  const [feedOpen, setFeedOpen] = useState(false); // desktop: nieuwsfeed in/uit
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState("chat"); // "chat" | "newsfeed"

  // Chat state
  const [messageType, setMessageType] = useState(loaded.messageType || "Social Media");
  const tone = "Automatisch"; // UI zonder keuzepills
  const [profileKey, setProfileKey] = useState(loaded.profileKey || "default");

  const [messages, setMessages] = useState([
    { role: "assistant", text: getGreeting(), meta: { type: "System", tone: "-" } },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Send button show with 200ms fade-out delay
  const [showSend, setShowSend] = useState(false);
  const [showSendDelayed, setShowSendDelayed] = useState(false);

  const copiedTimer = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { setShowSend(input.trim().length > 0); }, [input]);
  useEffect(() => {
    if (showSend) setShowSendDelayed(true);
    else { const t = setTimeout(() => setShowSendDelayed(false), 200); return () => clearTimeout(t); }
  }, [showSend]);

  useEffect(() => { if (inputRef.current) autoresizeTextarea(inputRef.current); return () => copiedTimer.current && clearTimeout(copiedTimer.current); }, []);
  useEffect(() => { safeSave({ messageType, tone, profileKey }); }, [messageType, tone, profileKey]);

  const onInputChange = (e) => { setInput(e.target.value); autoresizeTextarea(e.target); };

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = (input || "").trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed, meta: { type: messageType, tone, profileKey } }]);
    setInput("");

    setIsTyping(true);
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", text: generateAssistantReply(trimmed, messageType, tone), meta: { type: messageType, tone, profileKey } }]);
      setIsTyping(false);
    }, 500);
  }

  function handleCopied(id) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
  }

  const openNewsfeedMobile = () => { setMobileView("newsfeed"); setMobileMenuOpen(false); };
  const backToChatMobile = () => setMobileView("chat");

  const isFresh = messages.length === 1 && !messages.some((m) => m.role === "user");

  return (
    <div className="fixed inset-0 flex bg-white text-gray-900">
      {/* Desktop: vaste linker sidebar */}
      <AppSidebar onToggleFeed={() => setFeedOpen((v) => !v)} feedOpen={feedOpen} />

      {/* Mobiel: hamburger drawer */}
      <MobileDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onSelect={(v) => (v === "newsfeed" ? openNewsfeedMobile() : setMobileView("chat"))}
      />

      {/* MOBILE fullscreen view: newsfeed */}
      {mobileView === "newsfeed" && (
        <div className="md:hidden fixed inset-0 z-40 bg-white">
          <div className="h-14 border-b flex items-center px-3 gap-2">
            <button
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"
              onClick={backToChatMobile}
              aria-label="Terug"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="text-sm font-semibold">Nieuwsfeed</div>
          </div>
          <div className="p-3 space-y-3 overflow-y-auto h-[calc(100vh-56px)]">
            {getSidebarItems().map((it, i) => (
              <article key={i} className="rounded-lg border border-gray-200 p-3">
                <div className="text-sm font-medium text-[#2563eb]">{it.title}</div>
                <p className="text-sm text-gray-600 mt-1">{it.summary}</p>
                <p className="text-[11px] text-gray-400 mt-2">
                  {it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Center stage: full-width header + centered chat column */}
      <div className="flex-1 min-w-0 flex flex-col ml-0 md:ml-64">{/* leave room for sidebar on desktop */}
        {/* Header (full-width, subtiele divider) */}
        <header className="h-14 border-b border-gray-200 flex items-center px-5 bg-white">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden -ml-1 mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-[#2563eb]">Blueline Chatpilot</h1>
          <p className="ml-3 text-sm text-gray-500">Jouw 24/7 assistent voor klantcontact</p>
        </header>

        {/* Messages area (no card borders; centered column) */}
        <main className="flex-1 min-h-0 overflow-y-auto" ref={listRef}>
          <div className="max-w-[760px] mx-auto px-5">
            {/* Hero greeting (1/3 screen height) */}
            {isFresh ? (
              <div className="pt-[20vh] pb-8 text-center">
                <div className="text-4xl sm:text-5xl font-semibold text-[#2563eb]">Hallo!</div>
                <p className="mt-2 text-gray-500">Waarmee kan ik je vandaag helpen?</p>
              </div>
            ) : (
              <div className="py-6 flex flex-col gap-5">
                {messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={idx} className={cx("flex", isUser ? "justify-end" : "justify-start")}> 
                      <div className={cx("px-5 py-3 rounded-2xl text-[15px] leading-6", isUser ? "bg-[#2563eb] text-white" : "bg-gray-100 text-gray-900")}>{m.text}</div>
                      {!isUser && (
                        <div className="ml-2 self-end">
                          <CopyButton id={`msg-${idx}`} text={m.text} onCopied={() => {}} isCopied={false} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {isTyping && <div className="text-sm text-gray-500">Typen…</div>}
              </div>
            )}
          </div>
        </main>

        {/* Dock (bordered input only; like Gemini/GPT) */}
        <div className="bg-white border-t border-gray-200">
          <form onSubmit={handleSend} className="max-w-[760px] mx-auto px-5 py-3">
            <div className="relative rounded-2xl border border-gray-200 bg-white">
              {/* textarea */}
              <div className="px-4 pt-3 pb-10">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={onInputChange}
                  placeholder="Typ een bericht..."
                  className="w-full resize-none outline-none placeholder:text-gray-400 placeholder:text-[15px] text-[15px] leading-6"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                />
              </div>

              {/* bottom row: +, type toggles, mic + send */}
              <div className="absolute left-0 right-0 bottom-0 h-10 flex items-center">
                {/* left controls */}
                <div className="pl-4 flex items-center gap-3">
                  {/* plus (future: profile menu) */}
                  <button type="button" className="w-5 h-5 text-gray-400 hover:text-gray-600" title="Meer" aria-label="Meer">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>

                  {/* type toggles */}
                  <div className="flex items-center gap-4 text-[14px]">
                    {["Social Media", "E-mail"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMessageType(t)}
                        className={cx("rounded-md px-2 py-1 transition-colors", messageType === t ? "text-gray-900 font-semibold" : "text-gray-500 hover:bg-gray-100")}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* right controls */}
                <div className="ml-auto pr-3 flex items-center gap-2">
                  {/* mic icon (non-functional for now) */}
                  <button
                    type="button"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                    aria-label="Spraak"
                    title="Spraak"
                  >
                    <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z" />
                      <path d="M19 10v2a7 7 0 01-14 0v-2" />
                      <path d="M12 19v3" />
                    </svg>
                  </button>

                  {/* send plane (fade + 200ms hide delay) */}
                  {showSendDelayed && (
                    <button
                      type="submit"
                      className={cx("w-9 h-9 rounded-full flex items-center justify-center bg-[#2563eb] text-white shadow transition-all duration-200", showSend ? "opacity-100 scale-100" : "opacity-0 scale-95")}
                      aria-label="Versturen"
                    >
                      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <div className="text-center text-[12px] text-gray-500 pb-3">Chatpilot kan fouten maken. Controleer belangrijke informatie.</div>
        </div>
      </div>
    </div>
  );
}

/******************** ErrorBoundary + Export ********************/
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="min-h-screen flex items-center justify-center">Er ging iets mis</div>;
    return this.props.children;
  }
}

export default function BluelineChatpilot() {
  return (
    <ErrorBoundary>
      <BluelineChatpilotInner />
    </ErrorBoundary>
  );
}
