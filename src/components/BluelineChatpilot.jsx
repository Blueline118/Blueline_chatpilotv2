import React, { useEffect, useRef, useState } from "react";

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
            <p className="text-sm text-gray-600">
              De interface kon niet geladen worden. Probeer de pagina te verversen.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
              className="mt-3 text-xs underline text-blue-600"
            >
              {this.state.showDetails ? "Verberg details" : "Toon details"}
            </button>
            {this.state.showDetails && (
              <pre className="mt-2 text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-40">
                {this.state.errorMsg}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- Utility ---------------- */
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}
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
    if (!canUseStorage())
      return { messageType: "Social Media", tone: "Formeel", profileKey: "default" };
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
      return `Onderwerp: ${subject}

Geachte [Naam],

Hartelijk dank voor uw bericht. Wij nemen dit direct in behandeling en komen binnen 1 werkdag bij u terug. Zou u (indien nog niet gedeeld) uw ordernummer en eventuele foto's/bijlagen kunnen toevoegen? Dan helpen wij u zo snel mogelijk verder.

Met vriendelijke groet,
Blueline Customer Care`;
    }
    if (t === "informeel") {
      return `Onderwerp: ${subject} 🙌

Hoi [Naam],

Thanks voor je bericht! We gaan er meteen mee aan de slag en komen vandaag nog bij je terug. Kun je (als je dat nog niet deed) je ordernummer en eventueel een foto toevoegen? Dan fixen we het sneller.

Groet,
Blueline Customer Care`;
    }
    return `Onderwerp: ${subject}

Hi [Naam],

Bedankt voor je bericht. We pakken dit direct op en laten je binnen 1 werkdag iets weten. Zou je je ordernummer en eventuele bijlagen willen delen? Dan helpen we je snel verder.

Hartelijke groet,
Blueline Customer Care`;
  }

  if (t === "formeel") {
    return `Dank voor uw bericht. We kijken dit graag voor u na. Kunt u het ordernummer en uw postcode delen? Dan controleren we direct de status en koppelen we terug met een update.`;
  }
  if (t === "informeel") {
    return `Thanks voor je bericht! We checken het gelijk. Stuur je ordernummer en je postcode even mee? Dan geven we je snel een update 🙂`;
  }
  return `Dankjewel voor je bericht! Ik kijk dit meteen voor je na. Als je je ordernummer en postcode deelt, sturen we je snel een update.`;
}

/* ---------------- Dev self-tests (veilig in prod) ---------------- */
const IS_DEV =
  (typeof process !== "undefined" &&
    process &&
    process.env &&
    process.env.NODE_ENV !== "production") ||
  (typeof __DEV__ !== "undefined" && __DEV__ === true);

function runSelfTests() {
  try {
    const baseCases = [
      { type: "E-mail", tone: "Formeel", text: "Mijn order #12345 is niet geleverd" },
      { type: "E-mail", tone: "Informeel", text: "Waar blijft m'n bestelling 98765?" },
      { type: "E-mail", tone: "Formeel", text: "Vraag over retourneren zonder nummer" },
      { type: "Social Media", tone: "Formeel", text: "Order 4567 niet ontvangen" },
      { type: "Social Media", tone: "Informeel", text: "Bestelling kapot aangekomen #33333" },
    ];
    baseCases.forEach((c) => {
      const out = generateAssistantReply(c.text, c.type, c.tone);
      console.assert(typeof out === "string" && out.length > 20, "Invalid output");
      if (c.type === "E-mail") console.assert(out.startsWith("Onderwerp:"), "Email needs subject");
    });
  } catch {}
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

/* ---------------- Hoofdcomponent ---------------- */
function InnerChatpilot() {
  const loaded =
    typeof window !== "undefined"
      ? safeLoad()
      : { messageType: "Social Media", tone: "Formeel", profileKey: "default" };

  const [messageType, setMessageType] = useState(loaded.messageType);
  // Tijdelijk: UI heeft geen toonkeuze; altijd Automatisch
  const tone = "Automatisch";

  // Nieuw: klantprofiel (Standaard of Merrachi)
  const [profileKey, setProfileKey] = useState(loaded.profileKey || "default");
  // Voor het open/dicht klappen van het mini-profielmenu
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Altijd starten met 1 dynamische begroeting (géén history laden)
  const [messages, setMessages] = useState([
    { role: "assistant", text: getGreeting(), meta: { type: "System", tone: "-" } },
  ]);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const copiedTimer = useRef(null);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (IS_DEV) runSelfTests();
  }, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) autoresizeTextarea(inputRef.current);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    safeSave({ messageType, tone, profileKey });
  }, [messageType, tone, profileKey]);

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = (input || "").trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed, meta: { type: messageType, tone, profileKey } },
    ]);
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
      const reply =
        r.ok && data?.text ? data.text : generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone, profileKey } },
      ]);
    } catch {
      const reply = generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone, profileKey } },
      ]);
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
        <div className="mx-auto max-w-[760px] px-3 pt-6">
          <div className="flex flex-col rounded-2xl border border-gray-200 shadow-lg bg-white h-[calc(100vh-1rem)]">
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

                          {/* Copy alleen voor assistent en BINNEN de bubbel, onderin rechts */}
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

            {/* Dock */}
            <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
              <div className="px-5 py-3">
                <form onSubmit={handleSend} aria-label="Bericht verzenden">
                  {/* Invoerbalk — groter kader met invoerveld boven en kanaal-toggle onder */}
<div className="relative flex flex-col bg-white border border-[#e5e7eb] rounded-[16px] px-3 py-2 focus-within:ring-2 focus-within:ring-[#2563eb]/25">

  {/* Bovenste rij: + icoon, textarea, verzendknop */}
  <div className="flex items-center gap-2">
    {/* + icoon (profiel) */}
    <div className="relative">
      <button
        type="button"
        onClick={() => setProfileMenuOpen((v) => !v)}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
        title="Klantprofiel kiezen"
        aria-haspopup="menu"
        aria-expanded={profileMenuOpen}
        aria-label="Klantprofiel kiezen"
      >
        <svg
          viewBox="0 0 24 24"
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Dropdownmenu profielen */}
      {profileMenuOpen && (
        <div
          role="menu"
          className="absolute z-20 bottom-full mb-2 w-40 rounded-lg border border-gray-200 bg-white shadow-md overflow-hidden"
        >
          <button
            type="button"
            onClick={() => {
              setProfileKey("default");
              setProfileMenuOpen(false);
            }}
            className={cx(
              "block w-full text-left px-3 py-2 text-sm transition-colors",
              profileKey === "default"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-700 hover:bg-gray-50"
            )}
            role="menuitem"
          >
            Standaard
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileKey("merrachi");
              setProfileMenuOpen(false);
            }}
            className={cx(
              "block w-full text-left px-3 py-2 text-sm transition-colors",
              profileKey === "merrachi"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-700 hover:bg-gray-50"
            )}
            role="menuitem"
          >
            Merrachi
          </button>
        </div>
      )}
    </div>

    {/* Tekstveld */}
    <label htmlFor="message" className="sr-only">Typ een bericht…</label>
    <textarea
      id="message"
      ref={inputRef}
      rows={1}
      className="flex-1 bg-transparent focus:outline-none px-2 resize-none min-h-[40px] text-[15px] leading-6 placeholder-gray-400"
      placeholder="Typ een bericht…"
      value={input}
      onChange={(e) => { setInput(e.target.value); autoresizeTextarea(e.target); }}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
      aria-label="Bericht invoeren"
      autoComplete="off"
    />

    {/* Verzendknop */}
    <button
      type="submit"
      aria-label="Verzenden"
      disabled={!input.trim()}
      className={cx(
        "flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all duration-200",
        !input.trim()
          ? "opacity-60 cursor-not-allowed bg-[#2563eb]"
          : "bg-[#2563eb] hover:brightness-110 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40"
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5" />
        <path d="M6 11l6-6 6 6" />
      </svg>
    </button>
  </div>

  {/* Onderste rij: kanaal-toggle */}
  <div className="flex items-center gap-3 mt-2 pl-10">
    {["Social Media", "E-mail"].map((t) => {
      const selected = messageType === t;
      return (
        <button
          key={t}
          type="button"
          onClick={() => setMessageType(t)}
          className={cx(
            "text-sm px-2 py-1 rounded-full transition-colors",
            selected
              ? "text-gray-900 font-medium"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          )}
        >
          {t}
        </button>
      );
    })}
  </div>
</div>

                    {/* Verzendknop — ronde blauwe knop met dikkere ↑ */}
                    <button
                      type="submit"
                      aria-label="Verzenden"
                      disabled={!input.trim()}
                      className={cx(
                        "flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all duration-200",
                        !input.trim()
                          ? "opacity-60 cursor-not-allowed bg-[#2563eb]"
                          : "bg-[#2563eb] hover:brightness-110 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40"
                      )}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 19V5" />
                        <path d="M6 11l6-6 6 6" />
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>
            {/* /Dock */}
          </div>

          <div className="mt-2 text-center text-[12px] text-gray-500">
            Chatpilot kan fouten maken. Controleer belangrijke informatie.
          </div>
        </div>
      </div>
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
