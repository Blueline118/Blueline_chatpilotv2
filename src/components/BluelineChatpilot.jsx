import React, { useEffect, useRef, useState } from "react";

/******************** Utils ********************/
const cx = (...args) => args.filter(Boolean).join(" ");

function autoresizeTextarea(el) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = Math.min(el.scrollHeight, 200) + "px"; // cap height
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

function extractOrderNumber(s) {
  if (!s) return null;
  const m = String(s).match(/#?(\d{4,})/);
  return m ? m[1] : null;
}

function generateAssistantReply(text, type, tone) {
  const lc = (text || "").toLowerCase();
  const negativeHints = [
    "boos",
    "slecht",
    "belachelijk",
    "klacht",
    "niet ontvangen",
    "vertraagd",
    "kapot",
    "beschadigd",
    "annuleren",
    "terugbetalen",
    "refund",
  ];
  const urgentHints = [
    "dringend",
    "met spoed",
    "urgent",
    "nu",
    "direct",
    "zo snel mogelijk",
  ];
  const hasNeg = negativeHints.some((w) => lc.includes(w));
  const hasUrgent = urgentHints.some((w) => lc.includes(w));
  const autoTone = tone === "Automatisch" ? (hasNeg || hasUrgent ? "Formeel" : "Informeel") : tone;
  const isEmail = type === "E-mail";
  const orderNo = extractOrderNumber(text);
  const subject = orderNo ? `Vraag over order #${orderNo}` : `Vraag over je bestelling`;

  if (isEmail) {
    if (autoTone === "Formeel") {
      return `Geachte [Naam],\n\nDank voor uw bericht. We nemen dit direct in behandeling. Kunt u het ordernummer en uw postcode delen (en bij schade een foto)? Dan controleren wij de status en koppelen we binnen 1 werkdag terug.\n\nMet vriendelijke groet,\nBlueline Customer Care`;
    }
    return `Hoi [Naam],\n\nThanks voor je bericht! Stuur je ordernummer en postcode even mee (en bij schade een foto)? Dan checken we het direct en kom ik vandaag nog bij je terug.\n\nGroet,\nBlueline Customer Care`;
  }

  if (autoTone === "Formeel") {
    return `Dank voor uw bericht. Kunt u uw ordernummer en postcode delen (en bij schade een foto)? Dan controleren wij direct de status en koppelen we terug met een update.`;
  }
  return `Thanks voor je bericht! Stuur je ordernummer en je postcode even mee (en bij schade een foto)? Dan check ik het direct en krijg je snel een update 🙂`;
}

function getSidebarItems() {
  return [
    {
      title: "Customer Care trend: AI hand-offs",
      summary: "Korte duiding waarom dit relevant is voor supportteams. 2–3 regels.",
      source: "CX Today",
      date: "2025-08-31",
    },
    {
      title: "Retourbeleid optimaliseren",
      summary: "Best practices rond retouren en klanttevredenheid, kort samengevat.",
      source: "E-commerce NL",
      date: "2025-08-29",
    },
    {
      title: "Bezorging & transparency",
      summary: "Heldere updates verminderen druk op support.",
      source: "Logistiek Pro",
      date: "2025-08-27",
    },
  ];
}

/******************** UI Bits ********************/
function CopyButton({ id, text, onCopied, isCopied }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text || "");
        if (ok) onCopied?.(id);
      }}
      className={cx(
        "inline-flex items-center gap-1 text-[11px] transition-colors select-none",
        isCopied ? "text-emerald-600" : "text-gray-500 hover:text-gray-700"
      )}
      aria-label={isCopied ? "Gekopieerd" : "Kopieer bericht"}
      title={isCopied ? "Gekopieerd" : "Kopieer bericht"}
    >
      {isCopied ? (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
          <path d="M9 16.2l-3.5-3.5a1 1 0 10-1.4 1.4l4.2 4.2a1 1 0 001.4 0l10-10a1 1 0 10-1.4-1.4L9 16.2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
          <path d="M16 1H6a2 2 0 00-2 2v12h2V3h10V1zm3 4H10a2 2 0 00-2 2v14a2 2 0 002 2h9a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H10V7h9v14z" />
        </svg>
      )}
      <span>{isCopied ? "Gekopieerd" : "Kopieer"}</span>
    </button>
  );
}

/* ---- Desktop: vaste linker sidebar (volledige hoogte) ---- */
function AppSidebar({ onToggleFeed }) {
  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 z-30 w-14 border-r border-gray-200 bg-white flex-col items-center p-2 gap-2">
      <button
        type="button"
        onClick={onToggleFeed}
        title="Nieuwsfeed"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-600 hover:bg-gray-100"
        aria-label="Nieuwsfeed"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h10M4 18h16" />
        </svg>
      </button>
      <button title="Instellingen" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100" aria-label="Instellingen">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.12a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.12a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06A2 2 0 016.07 2.3l.06.06c.47.47 1.14.62 1.82.33H8a1.65 1.65 0 001-1.51V1a2 2 0 014 0v.12c0 .67.39 1.28 1 1.51.68.29 1.35.14 1.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06c-.47.47-.62 1.14-.33 1.82.23.61.84 1 1.51 1H21a2 2 0 010 4h-.12c-.67 0-1.28.39-1.51 1z" />
        </svg>
      </button>
    </aside>
  );
}

/* ---- Desktop: nieuwsfeed-paneel, past in linker-gutter naast gecentreerde chat ---- */
function NewsfeedPanel({ open }) {
  const items = getSidebarItems();
  // Rail is 56px (w-14). Maak de panelbreedte afhankelijk van de beschikbare linker gutter,
  // zodat hij NIET over de gecentreerde chat valt.
  const widthStyle = {
    width: "clamp(240px, calc((100vw - 760px) / 2 - 16px), 360px)",
  };
  return (
    <div
      className={cx(
        "hidden md:block fixed top-0 bottom-0 left-14 z-10 transition-transform duration-300", // onder de chat in z-order
        open ? "translate-x-0" : "-translate-x-[120%]"
      )}
      style={widthStyle}
      aria-hidden={!open}
    >
      <div className="h-full w-full border-r border-gray-200 bg-white">
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold text-gray-800">📢 Nieuwsfeed</h2>
          <p className="text-xs text-gray-500 mt-0.5">Wekelijks 1–3 items</p>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto p-3 space-y-3">
          {items.map((it, i) => (
            <article key={i} className="rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
              <div className="text-sm font-medium text-[#2563eb]">{it.title}</div>
              <p className="text-sm text-gray-600 mt-1">{it.summary}</p>
              <p className="text-[11px] text-gray-400 mt-2">
                {it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Mobiel: hamburger + full-screen views ---- */
function MobileMenu({ open, onClose, onSelect }) {
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

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

  useEffect(() => { listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (inputRef.current) autoresizeTextarea(inputRef.current); return () => copiedTimer.current && clearTimeout(copiedTimer.current); }, []);
  useEffect(() => { safeSave({ messageType, tone, profileKey }); }, [messageType, tone, profileKey]);

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = (input || "").trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed, meta: { type: messageType, tone, profileKey } }]);
    setInput("");
    if (inputRef.current) autoresizeTextarea(inputRef.current);

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
    } finally {
      setIsTyping(false);
    }
  }

  function handleCopied(id) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
  }

  const onInputChange = (e) => { setInput(e.target.value); autoresizeTextarea(e.target); };

  const openNewsfeedMobile = () => { setMobileView("newsfeed"); setMobileMenuOpen(false); };
  const backToChatMobile = () => setMobileView("chat");

  return (
    <div className="fixed inset-0 flex bg-gradient-to-b from-[#f6f7fb] to-white text-gray-900">
      {/* Desktop: vaste linker sidebar (volledige hoogte) */}
      <AppSidebar onToggleFeed={() => setFeedOpen((v) => !v)} />

      {/* Desktop: nieuwsfeed-paneel (valt in linker-gutter, onder de chat in z-index) */}
      <NewsfeedPanel open={feedOpen} />

      {/* Mobiel: hamburger menu */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onSelect={(v) => (v === "newsfeed" ? openNewsfeedMobile() : setMobileView("chat"))}
      />

      {/* MOBILE fullscreen feature view */}
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

      {/* Centered chat column (blijft gecentreerd; beweegt niet mee) */}
      <div className="flex-1 flex justify-center min-w-0">
        <div className="relative w-full max-w-[760px] h-full px-3 pt-6 pb-4">
          <div className="flex h-full flex-col rounded-2xl border border-gray-200 shadow-lg bg-white">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-blue-600/20">
              <div className="bg-gradient-to-r from-[#2563eb] to-[#1e40af]">
                <div className="px-5 py-4 flex items-center gap-3">
                  {/* Mobile hamburger (alleen mobiel zichtbaar) */}
                  <button
                    type="button"
                    className="md:hidden -ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
                    aria-label="Menu"
                    onClick={() => setMobileMenuOpen(true)}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M3 12h18M3 18h18" stroke="white" />
                    </svg>
                  </button>

                  {/* Titel (logo verwijderd) */}
                  <div className="flex-1">
                    <h1 className="text-lg font-semibold leading-tight text-white">Blueline Chatpilot+</h1>
                    <p className="text-[13px] text-white/85 -mt-0.5">Jouw 24/7 assistent voor klantcontact</p>
                  </div>

                  {/* Desktop: feed toggle rechts (icoon) */}
                  <button
                    type="button"
                    onClick={() => setFeedOpen((v) => !v)}
                    className="hidden md:inline-flex h-9 px-3 items-center rounded-lg text-white/90 hover:bg-white/10"
                    title="Nieuwsfeed tonen/verbergen"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 6h16M4 12h10M4 18h16" stroke="white" />
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            {/* Messages */}
            <main className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="px-5 py-5">
                <div className="flex flex-col gap-5" ref={listRef} role="log" aria-live="polite">
                  {messages.map((m, idx) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={idx} className={cx("flex", isUser ? "justify-end" : "justify-start")}>
                        <div
                          className={cx(
                            "max-w-[560px] rounded-2xl shadow-sm px-5 py-4 text-[15px] leading-6 break-words relative",
                            isUser
                              ? "bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] text-white"
                              : "bg-gray-100 text-gray-900 border border-gray-200"
                          )}
                        >
                          <p className="whitespace-pre-wrap">{m.text}</p>
                          {!isUser && (
                            <div className="mt-2 flex justify-end">
                              <CopyButton
                                id={`msg-${idx}`}
                                text={m.text}
                                onCopied={handleCopied}
                                isCopied={copiedId === `msg-${idx}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="max-w-[560px] rounded-2xl shadow-sm px-5 py-4 text-[15px] leading-6 bg-gray-100 text-gray-900 border border-gray-200">
                        <span className="inline-flex items-center gap-2">
                          <span className="relative inline-block w-6 h-2 align-middle">
                            <span className="absolute left-0 top-0 w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.2s]"></span>
                            <span className="absolute left-2 top-0 w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"></span>
                            <span className="absolute left-4 top-0 w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0.2s]"></span>
                          </span>
                          Typen…
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </main>

            {/* Dock */}
            <div className="border-t bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
              <form onSubmit={handleSend} className="px-4 py-3">
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
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                  </div>

                  {/* bottom row: +, type toggles, mic + send */}
                  <div className="absolute left-0 right-0 bottom-0 h-10 flex items-center">
                    {/* left controls */}
                    <div className="pl-4 flex items-center gap-3">
                      {/* plus + profielmenu (opent omhoog) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setProfileMenuOpen(v => !v)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600"
                          title="Klantprofiel kiezen"
                          aria-haspopup="menu"
                          aria-expanded={profileMenuOpen}
                          aria-label="Klantprofiel kiezen"
                        >
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                        {profileMenuOpen && (
                          <div role="menu" className="absolute z-20 bottom-full mb-2 w-44 rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden">
                            <button
                              type="button"
                              onClick={() => { setProfileKey('default'); setProfileMenuOpen(false); }}
                              className={cx(
                                "block w-full text-left px-3 py-2 text-sm transition-colors",
                                profileKey === "default" ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50"
                              )}
                              role="menuitem"
                            >
                              Standaard
                            </button>
                            <button
                              type="button"
                              onClick={() => { setProfileKey('merrachi'); setProfileMenuOpen(false); }}
                              className={cx(
                                "block w-full text-left px-3 py-2 text-sm transition-colors",
                                profileKey === "merrachi" ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50"
                              )}
                              role="menuitem"
                            >
                              Merrachi
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Kanaal-opties */}
                      <div className="flex items-center gap-3">
                        {["Social Media", "E-mail"].map((t) => {
                          const selected = messageType === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setMessageType(t)}
                              className={cx(
                                "text-sm px-2 py-1 rounded-full transition-colors",
                                selected ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                              )}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* right controls */}
                    <div className="ml-auto pr-3 flex items-center gap-2">
                      {/* mic (dummy) */}
                      <button
                        type="button"
                        className="hidden sm:inline-flex w-8 h-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                        aria-label="Spraak"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z" />
                          <path d="M19 10v2a7 7 0 01-14 0v-2" />
                          <path d="M12 19v3" />
                        </svg>
                      </button>

                      {/* send plane (fade + 200ms hide delay) */}
                      {showSendDelayed && (
                        <button
                          type="submit"
                          className={cx(
                            "w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-[#2563eb] text-white shadow transition-all duration-200",
                            showSend ? "opacity-100 scale-100" : "opacity-0 scale-95"
                          )}
                          aria-label="Versturen"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4 md:w-5 md:h-5"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Disclaimer onder de kaart, altijd zichtbaar */}
          <div className="mt-2 text-center text-[12px] text-gray-500">
            Chatpilot kan fouten maken. Controleer belangrijke informatie.
          </div>
        </div>
      </div>
    </div>
  );
}

/******************** ErrorBoundary + Export ********************/
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold mb-2">Er ging iets mis</h2>
            <p className="text-gray-600">Ververs de pagina en probeer het opnieuw.</p>
          </div>
        </div>
      );
    }
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
