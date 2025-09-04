import React, { useEffect, useRef, useState } from "react";

// --- Linker menurail (desktop) ---
function LeftRail({ feedOpen, onToggleFeed }) {
  const IconBtn = ({ label, children, active, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cx(
        "w-10 h-10 rounded-xl flex items-center justify-center",
        "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
        active ? "bg-gray-100 text-gray-800" : ""
      )}
      aria-label={label}
    >
      {children}
    </button>
  );

  return (
    <nav className="hidden md:flex w-14 shrink-0 rounded-2xl border border-gray-200 bg-white shadow-sm p-2 flex-col items-center gap-2">
      {/* Home (placeholder) */}
      <IconBtn label="Home">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 11l9-7 9 7" />
          <path d="M9 22V12h6v10" />
        </svg>
      </IconBtn>

      {/* Nieuwsfeed toggle */}
      <IconBtn label="Nieuwsfeed" active={feedOpen} onClick={onToggleFeed}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h10M4 18h16" />
        </svg>
      </IconBtn>

      {/* Instellingen (placeholder) */}
      <IconBtn label="Instellingen">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.12a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.12a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06A2 2 0 016.07 2.3l.06.06c.47.47 1.14.62 1.82.33H8a1.65 1.65 0 001-1.51V1a2 2 0 014 0v.12c0 .67.39 1.28 1 1.51.68.29 1.35.14 1.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06c-.47.47-.62 1.14-.33 1.82.23.61.84 1 1.51 1H21a2 2 0 010 4h-.12c-.67 0-1.28.39-1.51 1z" />
        </svg>
      </IconBtn>
    </nav>
  );
}

/* ---------------- Error Boundary (voorkomt wit scherm) ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: "", showDetails: false };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: error?.message || "Onbekende fout" };
  }
  componentDidCatch(error, info) {
    // Optioneel: logging
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white text-gray-800 px-4">
          <div className="max-w-md w-full border rounded-xl p-5 shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Er ging iets mis</h2>
            <p className="text-sm text-gray-600">De interface kon niet geladen worden. Probeer de pagina te verversen.</p>
            <button
              type="button"
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="mt-3 text-xs underline text-blue-600"
            >
              {this.state.showDetails ? "Verberg details" : "Toon details"}
            </button>
            {this.state.showDetails && (
              <pre className="mt-2 text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-40">{this.state.errorMsg}</pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Utility ---------------- */
const cx = (...args) => args.filter(Boolean).join(" ");
function autoresizeTextarea(el) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

/* ---------------- Veilige opslag helpers (géén messages bewaren) ---------------- */
const STORAGE_KEY = "blueline-chatpilot:v1";
function canUseStorage() {
  try {
    if (typeof window === "undefined") return false;
    const t = "__t__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}
function safeLoad() {
  try {
    if (!canUseStorage()) return { messageType: "Social Media", tone: "Formeel", profileKey: "default" };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messageType: "Social Media", tone: "Formeel", profileKey: "default" };
    const data = JSON.parse(raw);
    return {
      messageType: typeof data?.messageType === "string" ? data.messageType : "Social Media",
      tone: typeof data?.tone === "string" ? data.tone : "Formeel",
      profileKey: typeof data?.profileKey === "string" ? data.profileKey : "default",
    };
  } catch {
    return { messageType: "Social Media", tone: "Formeel", profileKey: "default" };
  }
}
function safeSave(pref) {
  try {
    if (!canUseStorage()) return;
    const prev = safeLoad();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        messageType: pref.messageType ?? prev.messageType,
        tone: pref.tone ?? prev.tone,
        profileKey: pref.profileKey ?? prev.profileKey,
      })
    );
  } catch {}
}

/* ---------------- Fase 2: begroetingen + ringbuffer ---------------- */
const GREET_COUNT_KEY = "greetingCount";
const GREET_HIST_KEY = "greetingHist:v1";
const gimmicks = [
  "Tijd om samen de wachtrijen korter te maken.",
  "Hoeveel tickets staan er nog open bij jou?",
  "Klaar om vandaag je klanttevredenheid een boost te geven?",
  "Welke klant maken we vandaag blij?",
  "Zin om je eerste-responstijd te verbeteren?",
  "Vandaag al een klant verrast met extra service?",
  "Laten we de NPS-score omhoog krijgen.",
  "Klaar om je SLA’s te rocken vandaag?",
  "Tijd voor koffie én een goede klantcase.",
  "Klaar voor een dag vol empathie en oplossingen?",
];
const energizers = [
  "✨ Vandaag gewoon doen waar je zin in hebt (en klanten blij maken onderweg).",
  "☕ Eerst koffie, dan magie voor je klanten.",
  "😄 Eén glimlach van jou = twee terug van je klant.",
  "🌞 Een beetje zon meegeven in elk bericht.",
  "🌟 Blije klanten beginnen bij jouw positieve vibe.",
  "💌 Jij bent het visitekaartje van de beleving.",
  "🚀 Zelfs kleine dingen voelen groot als je ze met plezier doet.",
  "🎉 Waarom gewoon goed zijn, als je ook leuk verrassend kan zijn?",
  "🌈 Vergeet niet: service mag ook gewoon fun zijn.",
  "💪 Service met kracht, energie en plezier!",
];
function getDaypartPrefix() {
  try {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return "Goedemorgen";
    if (h >= 12 && h < 18) return "Goedemiddag";
    if (h >= 18 && h < 24) return "Goedenavond";
    return "Hallo";
  } catch {
    return "Hallo";
  }
}
function loadGreetHist() {
  try {
    if (!canUseStorage()) return { gimmicks: [], energizers: [] };
    const raw = localStorage.getItem(GREET_HIST_KEY);
    if (!raw) return { gimmicks: [], energizers: [] };
    const j = JSON.parse(raw);
    return {
      gimmicks: Array.isArray(j?.gimmicks) ? j.gimmicks : [],
      energizers: Array.isArray(j?.energizers) ? j.energizers : [],
    };
  } catch {
    return { gimmicks: [], energizers: [] };
  }
}
function saveGreetHist(hist) {
  try {
    if (!canUseStorage()) return;
    localStorage.setItem(GREET_HIST_KEY, JSON.stringify(hist));
  } catch {}
}
function pickIndexAvoidingRecent(len, recent = []) {
  const all = Array.from({ length: len }, (_, i) => i);
  const candidates = all.filter((i) => !recent.includes(i));
  const pool = candidates.length > 0 ? candidates : all;
  const n = Math.floor(Math.random() * pool.length);
  return pool[n];
}
function getGreeting() {
  try {
    const can = canUseStorage();
    let count = 0;
    if (can) count = Number(localStorage.getItem(GREET_COUNT_KEY) || "0");
    count += 1;
    if (can) localStorage.setItem(GREET_COUNT_KEY, String(count));

    const hist = can ? loadGreetHist() : { gimmicks: [], energizers: [] };

    if (count % 3 === 0) {
      const idx = pickIndexAvoidingRecent(energizers.length, hist.energizers);
      const text = energizers[idx];
      if (can) saveGreetHist({ ...hist, energizers: [...hist.energizers, idx].slice(-2) });
      return text;
    } else {
      const prefix = getDaypartPrefix();
      const idx = pickIndexAvoidingRecent(gimmicks.length, hist.gimmicks);
      const text = `${prefix}! ${gimmicks[idx]}`;
      if (can) saveGreetHist({ ...hist, gimmicks: [...hist.gimmicks, idx].slice(-2) });
      return text;
    }
  } catch {
    return "Hallo! Klaar om aan de slag te gaan?";
  }
}

/* ---------------- Ordernummer & reply fallback ---------------- */
function extractOrderNumber(text = "") {
  if (!text) return null;
  const patterns = [
    /order\s*#?\s*(\d{4,})/i,
    /ordernummer\s*#?\s*(\d{4,})/i,
    /bestel(?:ling)?(?:nummer)?\s*#?\s*(\d{4,})/i,
    /ticket\s*#?\s*(\d{4,})/i,
    /#(\d{4})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}
function generateAssistantReply(text, type, tone) {
  const t = (tone || "").toLowerCase();
  const isEmail = type === "E-mail";
  const orderNo = extractOrderNumber(text);

  if (isEmail) {
    const subject = orderNo ? `Vraag over order #${orderNo}` : `Vraag over je bestelling`;

    if (t === "formeel") {
      return `Onderwerp: ${subject}\n\n\nGeachte [Naam],\n\n\nHartelijk dank voor uw bericht. Wij nemen dit direct in behandeling en komen binnen 1 werkdag bij u terug. Zou u (indien nog niet gedeeld) uw ordernummer en eventuele foto's/bijlagen kunnen toevoegen? Dan helpen wij u zo snel mogelijk verder.\n\n\nMet vriendelijke groet,\nBlueline Customer Care`;
    }
    if (t === "informeel") {
      return `Onderwerp: ${subject} 🙌\n\n\nHoi [Naam],\n\n\nThanks voor je bericht! We gaan er meteen mee aan de slag en komen vandaag nog bij je terug. Kun je (als je dat nog niet deed) je ordernummer en eventueel een foto toevoegen? Dan fixen we het sneller.\n\n\nGroet,\nBlueline Customer Care`;
    }
    return `Onderwerp: ${subject}\n\n\nHi [Naam],\n\n\nBedankt voor je bericht. We pakken dit direct op en laten je binnen 1 werkdag iets weten. Zou je je ordernummer en eventuele bijlagen willen delen? Dan helpen we je snel verder.\n\n\nHartelijke groet,\nBlueline Customer Care`;
  }

  if (t === "formeel") {
    return `Dank voor uw bericht. We kijken dit graag voor u na. Kunt u het ordernummer en uw postcode delen? Dan controleren we direct de status en koppelen we terug met een update.`;
  }
  if (t === "informeel") {
    return `Thanks voor je bericht! We checken het gelijk. Stuur je ordernummer en je postcode even mee? Dan geven we je snel een update 🙂`;
  }
  return `Dankjewel voor je bericht! Ik kijk dit meteen voor je na. Als je je ordernummer en postcode deelt, sturen we je snel een update.`;
}

/* ---------------- Copy helpers ---------------- */
async function copyToClipboard(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text || "");
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text || "";
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
function CopyButton({ id, text, onCopied, isCopied }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text || "");
        if (ok) onCopied(id);
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

/* ---------------- Sidebar (desktop) + items helper ---------------- */
function getSidebarItems() {
  return [
    { title: "Customer Care trend: AI hand-offs", source: "CX Today", date: "2025-08-31", summary: "Korte duiding waarom dit relevant is voor supportteams. 2–3 regels." },
    { title: "Retourbeleid optimaliseren", source: "E-commerce NL", date: "2025-08-29", summary: "Best practices rond retouren en klanttevredenheid, kort samengevat." },
    { title: "Bezorging & transparency", source: "Logistiek Pro", date: "2025-08-27", summary: "Heldere updates verminderen druk op support." },
  ];
}
function SidebarSkeleton({ open = true }) {
  const items = getSidebarItems();
  if (!open) {
    // smalle spacer zodat chat visueel niet “plakt” tegen de rail
    return <div className="hidden md:block w-2" aria-hidden />;
  }
  return (
    <aside className="hidden md:flex w-64 shrink-0 border border-gray-200 bg-white rounded-2xl flex-col overflow-hidden shadow-sm">
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold text-gray-800">📢 Nieuwsfeed</h2>
        <p className="text-xs text-gray-500 mt-0.5">Wekelijks 1–3 items</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
            <div className="text-sm font-medium text-[#2563eb] line-clamp-2">{it.title}</div>
            <p className="text-sm text-gray-600 mt-1 line-clamp-3">{it.summary}</p>
            <p className="text-[11px] text-gray-400 mt-2">
              {it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ---------------- Mobile ⓘ Drawer (slide-in) ---------------- */
function InfoDrawer({ open, onClose }) {
  const items = getSidebarItems();
  return (
    <div className={cx(
      "md:hidden fixed inset-0 z-50 transition-opacity",
      open ? "opacity-100" : "pointer-events-none opacity-0"
    )}>
      {/* Scrim */}
      <div
        className={cx("absolute inset-0 bg-black/30 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        className={cx(
          "absolute left-0 top-0 h-full w-[82%] max-w-[360px] bg-white shadow-xl border-r border-gray-200",
          "transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Nieuwsfeed"
      >
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">📢 Nieuwsfeed</h2>
            <p className="text-xs text-gray-500 mt-0.5">Wekelijks 1–3 items</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700"
            aria-label="Sluiten"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="h-[calc(100%-56px)] overflow-y-auto p-3 space-y-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3">
              <div className="text-sm font-medium text-[#2563eb]">{it.title}</div>
              <p className="text-sm text-gray-600 mt-1">{it.summary}</p>
              <p className="text-[11px] text-gray-400 mt-2">
                {it.source} • {new Date(it.date).toLocaleDateString("nl-NL")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Hoofdcomponent ---------------- */
function InnerChatpilot() {
  const loaded = typeof window !== "undefined" ? safeLoad() : { messageType: "Social Media", tone: "Formeel", profileKey: "default" };

  const [messageType, setMessageType] = useState(loaded.messageType);
  const tone = "Automatisch"; // tijdelijk: UI heeft geen toonkeuze
  const [profileKey, setProfileKey] = useState(loaded.profileKey || "default");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false); // mobiele drawer

  const [messages, setMessages] = useState([
    { role: "assistant", text: getGreeting(), meta: { type: "System", tone: "-" } },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimer = useRef(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  const IS_DEV = (typeof process !== "undefined" && process?.env?.NODE_ENV !== "production") || false;
  useEffect(() => {
    // beperkte self-test
    try {
      if (!IS_DEV) return;
      const out = generateAssistantReply("Mijn order #12345 is vertraagd", "E-mail", "Formeel");
      if (typeof out !== "string" || out.length < 20) console.warn("Self-test failed");
    } catch {}
  }, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) autoresizeTextarea(inputRef.current);
    return () => copiedTimer.current && clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    safeSave({ messageType, tone, profileKey });
  }, [messageType, tone, profileKey]);

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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f6f7fb] to-white text-gray-900">
      <div className="flex-1">
        <div className="mx-auto max-w-[1280px] px-3 pt-6">
          <div className="h-[calc(100vh-1rem)] flex gap-6">
            {/* Linker menurail (desktop) */}
<LeftRail feedOpen={feedOpen} onToggleFeed={() => setFeedOpen(v => !v)} />

{/* Nieuwsfeed (desktop) */}
<SidebarSkeleton open={feedOpen} />

{/* Chatkolom rechts */}
<div className="flex-1 flex flex-col rounded-2xl border border-gray-200 shadow-lg bg-white">
  {/* Header */}
  <header className="sticky top-0 z-10 border-b border-blue-600/20">
    <div className="bg-gradient-to-r from-[#2563eb] to-[#1e40af]">
      <div className="px-5 py-4 flex items-center gap-3">
        <div
          aria-hidden
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#2563eb]" fill="currentColor">
            <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0zm7.5-3.75a.75.75 0 011.5 0V12c0 .199-.079.39-.22.53l-2.75 2.75a.75.75 0 11-1.06-1.06l2.53-2.53V8.25z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight text-white">Blueline Chatpilot+</h1>
          <p className="text-[13px] text-white/85 -mt-0.5">
            Jouw 24/7 assistent voor klantcontact
          </p>
        </div>
      </div>
    </div>
  </header>
              {/* Messages */}
              <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                                <CopyButton id={`msg-${idx}`} text={m.text} onCopied={handleCopied} isCopied={copiedId === `msg-${idx}`} />
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
                              <span className="absolute left-2 top-0 w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0s]"></span>
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

              {/* Dock + disclaimer */}
              <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                <div className="px-5 py-3">
                  <form onSubmit={handleSend} aria-label="Bericht verzenden">
                    <div className="relative bg-white border border-[#e5e7eb] rounded-[16px] px-3 py-2 focus-within:ring-2 focus-within:ring-[#2563eb]/25">
                      {/* RĲ 1 — invoerveld */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <label htmlFor="message" className="sr-only">Typ een bericht…</label>
                          <textarea
                            id="message"
                            ref={inputRef}
                            rows={1}
                            className="w-full bg-transparent focus:outline-none resize-none min-h-[52px] text-[16px] md:text-[17px] leading-[1.45] placeholder:text-gray-400 placeholder:text-[16px] md:placeholder:text-[17px] pl-[11px]"
                            placeholder="Typ een bericht…"
                            value={input}
                            onChange={(e) => { setInput(e.target.value); autoresizeTextarea(e.target); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            aria-label="Bericht invoeren"
                            autoComplete="off"
                          />
                        </div>
                      </div>

                      {/* RĲ 2 — + icoon, kanaal-opties links — verzendknop rechts (alleen met tekst) */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* + icoon + profielmenu (opent omhoog) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setProfileMenuOpen(v => !v)}
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
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
                              <div
                                role="menu"
                                className="absolute z-20 bottom-full mb-2 w-44 rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden"
                              >
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

                          {/* Kanaal-opties (tekst-only met hover-balloon) */}
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

                        {/* Verzendknop met fade-in/out + delay */}
                        <div className={cx("transition-all duration-200", input.trim() ? "opacity-100 scale-100 delay-0" : "opacity-0 scale-90 pointer-events-none delay-200")}> 
                          <button
                            type="submit"
                            aria-label="Verzenden"
                            className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-[#2563eb] shadow-sm transition-all duration-200 hover:brightness-110 hover:scale-[1.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40"
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M22 2L11 13" />
                              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
                <div className="px-4 py-2 text-center text-[12px] text-gray-500">Chatpilot kan fouten maken. Controleer belangrijke informatie.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile ⓘ Drawer */}
      <InfoDrawer open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

/* ---------------- Export met ErrorBoundary ---------------- */
export default function BluelineChatpilot() {
  return (
    <ErrorBoundary>
      <InnerChatpilot />
    </ErrorBoundary>
  );
}
