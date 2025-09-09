import React, { useEffect, useRef, useState } from "react";

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
  if (h >= 23 || h < 6) return "Hallo"; // nacht → neutraal
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

function getSidebarItems() {
  return [
    { title: "Customer Care trend: AI hand-offs", summary: "Waarom dit relevant is voor supportteams.", source: "CX Today", date: "2025-08-31" },
    { title: "Retourbeleid optimaliseren", summary: "Best practices rond retouren.", source: "E-commerce NL", date: "2025-08-29" },
    { title: "Bezorging & transparency", summary: "Heldere updates verminderen druk.", source: "Logistiek Pro", date: "2025-08-27" },
  ];
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
function AppSidebar({ open, onToggleSidebar, onToggleFeed, feedOpen, onNewChat }) {
  const items = getSidebarItems();
  return (
    <aside
      className={cx(
        "hidden md:flex fixed left-0 top-0 bottom-0 z-30 w-64 border-r-2",
        "border-[#04a0de]/30",
        // Offwhite paneel met subtiele verloop
        "bg-gradient-to-b from-[#fafbff] via-[#f7f9ff] to-white",
        "flex-col transition-transform duration-300",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Paneel-handle (alleen desktop) — modern grip, BOVENIN */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="absolute top-3 -right-3 h-8 w-8 rounded-full shadow-sm bg-white text-[#66676b] hover:text-[#194297] hover:shadow-md border border-gray-200 grid place-items-center"
        aria-label={open ? "Zijbalk verbergen" : "Zijbalk tonen"}
        title={open ? "Zijbalk verbergen" : "Zijbalk tonen"}
      >
        {/* 6-dot grip (GPT-achtig) */}
        <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="7" r="1.25"/><circle cx="16" cy="7" r="1.25"/>
          <circle cx="8" cy="12" r="1.25"/><circle cx="16" cy="12" r="1.25"/>
          <circle cx="8" cy="17" r="1.25"/><circle cx="16" cy="17" r="1.25"/>
        </svg>
      </button>

      {/* (Titel verwijderd op verzoek) */}

      {/* Acties */}
      <nav className="pt-12 px-3 flex-1 overflow-y-auto space-y-3">
        {/* Nieuwe chat */}
        <button
          type="button"
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:shadow-[0_6px_18px_rgba(25,66,151,0.08)] text-[#194297]"
        >
          {/* pen/pad icoon */}
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          <span className="font-medium">Nieuwe chat</span>
        </button>

        {/* Insights */}
        <button
          type="button"
          onClick={onToggleFeed}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-gray-200 bg-white text-[#65676a] hover:text-[#194297] hover:shadow-[0_6px_18px_rgba(25,66,151,0.08)]"
        >
          <span className="inline-flex items-center gap-2">
            {/* outline megaphone */}
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10l12-5v14L3 14z"/><path d="M15 5l6-2v18l-6-2"/>
            </svg>
            Insights
          </span>
          {/* status-tekst (open/dicht) VERWIJDERD */}
        </button>

        {feedOpen && (
          <div className="ml-1 mt-2 space-y-2">
            {items.slice(0,3).map((it, i) => (
              <article key={i} className="rounded-lg border border-gray-200 bg-white p-3 hover:shadow-[0_6px_18px_rgba(25,66,151,0.08)]">
                <div className="text-sm font-semibold text-[#194297]">{it.title}</div>
                <p className="text-xs text-[#66676b] mt-1">{it.summary}</p>
                <p className="text-[11px] text-[#04a0de] mt-1">{it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}</p>
              </article>
            ))}
          </div>
        )}
      </nav>

      {/* Profiel onderaan */}
      <div className="mt-auto p-3 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#e8efff] grid place-items-center text-[#194297] font-semibold">SB</div>
          <div>
            <div className="text-sm font-medium text-[#194297]">Samir Bouchdak</div>
            <div className="text-[11px] text-[#66676b]">Profiel actief</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/******************** Mobile Drawer (hamburger) ********************/
function MobileDrawer({ open, onClose, onSelect }) {
  return (
    <div className={cx("md:hidden fixed inset-0 z-50 transition-opacity", open ? "opacity-100" : "opacity-0 pointer-events-none")}> 
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className={cx("absolute left-0 top-0 h-full w-[82%] max-w-[360px] bg-white shadow-xl border-r border-gray-200 p-4", open ? "translate-x-0" : "-translate-x-full", "transition-transform duration-300")}> 
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-[#194297]">Menu</div>
          <button className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100" onClick={onClose} aria-label="Sluiten">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 text-[#04a0de]" onClick={() => { onSelect("newsfeed"); onClose(); }}>📢 Insights</button>
        <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 text-[#04a0de]" onClick={() => { onSelect("chat"); onClose(); }}>💬 Chat</button>
      </div>
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
    } catch {
      const reply = generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [...prev, { role: "assistant", text: reply, meta: { type: messageType, tone, profileKey } }]);
    } finally { setIsTyping(false); }
  }

  function handleCopied(id) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
  }

  const openNewsfeedMobile = () => { setMobileView("newsfeed"); setMobileMenuOpen(false); };
  const backToChatMobile = () => setMobileView("chat");

  const handleNewChat = () => {
    setMessages([{ role: "assistant", text: "__hero__", meta: { type: "System" } }]);
    setInput("");
    setIsTyping(false);
    // focus meteen in het invoerveld
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="fixed inset-0 bg-white text-[#65676a]">
      {/* Desktop sidebar */}
      <AppSidebar
        open={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleFeed={() => setFeedOpen((v) => !v)}
        feedOpen={feedOpen}
        onNewChat={handleNewChat}
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

      {/* Main column met padding links wanneer sidebar open is */}
      <div className={cx("h-full flex flex-col transition-[padding] duration-300", sidebarOpen ? "md:pl-64" : "md:pl-0")}> 
        {/* Header */}
        <header className="h-14 border-b border-gray-200 flex items-center px-4 md:px-5 bg-white sticky top-0 z-10">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden -ml-1 mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#65676a] hover:bg-gray-100"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>

          <h1 className="text-[15px] md:text-base font-semibold text-[#194297]">Blueline Chatpilot</h1>
          <p className="hidden sm:block ml-3 text-sm text-[#66676b]">Jouw 24/7 assistent voor klantcontact</p>
        </header>

        {/* Mobile drawer attach */}
        <MobileDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          onSelect={(v) => (v === "newsfeed" ? openNewsfeedMobile() : setMobileView("chat"))}
        />

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
              {getSidebarItems().map((it, i) => (
                <article key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-sm font-semibold text-[#194297]">{it.title}</div>
                  <p className="text-sm text-[#66676b] mt-1">{it.summary}</p>
                  <p className="text-[11px] text-[#04a0de] mt-2">{it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable chat viewport */}
        <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto w-full max-w-[760px] px-4 md:px-5">
            {/* Hero greeting zolang er geen user-message is */}
            {!messages.some(m=>m.role === "user") ? (
              <div className="h-[calc(100vh-14rem)] flex flex-col items-center justify-center text-center select-none">
                <div className="text-3xl md:text-4xl font-semibold text-[#194297]">{heroTitle}</div>
                <div className="mt-2 text-sm text-[#66676b]">{heroSub}</div>
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

        {/* Dock (alleen input-blok) */}
        <div className="border-t border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
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

      {/* Mobile drawer lives outside padding so it overlays full */}
      <MobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} onSelect={(v)=> (v === 'newsfeed' ? setMobileView('newsfeed') : setMobileView('chat'))} />
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
