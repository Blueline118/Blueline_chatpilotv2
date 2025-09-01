import React, { useEffect, useRef, useState } from "react";

// Utility to merge class names
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Auto-resize helper for textarea
function autoresizeTextarea(el) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = Math.min(el.scrollHeight, 200) + "px"; // cap op 200px
}

// Local storage helpers (we bewaren GEEN messages meer, alleen voorkeuren)
const STORAGE_KEY = "blueline-chatpilot:v1";
function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { messageType: "Social Media", tone: "Formeel" };
    const data = JSON.parse(raw);
    return {
      messageType: typeof data?.messageType === "string" ? data.messageType : "Social Media",
      tone: typeof data?.tone === "string" ? data.tone : "Formeel",
    };
  } catch {
    return { messageType: "Social Media", tone: "Formeel" };
  }
}
function safeSave({ messageType, tone }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ messageType, tone }));
  } catch {}
}

// --- Fase 2: begroetingen ---
const GREET_COUNT_KEY = "greetingCount";
const GREET_HIST_KEY = "greetingHist:v1"; // per-type ringbuffer (laatste 2)

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
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Goedemorgen";
  if (h >= 12 && h < 18) return "Goedemiddag";
  if (h >= 18 && h < 24) return "Goedenavond";
  return "Hallo"; // nacht fallback
}

function loadGreetHist() {
  try {
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
    localStorage.setItem(GREET_HIST_KEY, JSON.stringify(hist));
  } catch {}
}

function pickIndexAvoidingRecent(len, recent = []) {
  const all = Array.from({ length: len }, (_, i) => i);
  const candidates = all.filter((i) => !recent.includes(i));
  const pool = candidates.length > 0 ? candidates : all; // fallback als (bijna) alle items recent
  const n = Math.floor(Math.random() * pool.length);
  return pool[n];
}

function getGreeting() {
  // Teller ophalen & ophogen (persistente rotatie 1–2 gimmick, 3 energizer)
  let count = Number(localStorage.getItem(GREET_COUNT_KEY) || "0");
  count += 1;
  localStorage.setItem(GREET_COUNT_KEY, String(count));

  // Hist ophalen
  const hist = loadGreetHist();

  if (count % 3 === 0) {
    // Energizer (zonder dagdeelprefix) met anti-herhaling
    const idx = pickIndexAvoidingRecent(energizers.length, hist.energizers);
    const text = energizers[idx];
    const next = [...hist.energizers, idx].slice(-2);
    saveGreetHist({ ...hist, energizers: next });
    return text;
  } else {
    // Gimmick (mét dagdeelprefix) met anti-herhaling
    const prefix = getDaypartPrefix();
    const idx = pickIndexAvoidingRecent(gimmicks.length, hist.gimmicks);
    const text = `${prefix}! ${gimmicks[idx]}`;
    const next = [...hist.gimmicks, idx].slice(-2);
    saveGreetHist({ ...hist, gimmicks: next });
    return text;
  }
}

// Extract a likely order number (e.g., 12345 or #12345) from user text
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

// --- Reply generator (fallback) ---
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

  // SOCIAL (DM-context): direct helpen, geen "stuur DM"
  if (t === "formeel") {
    return `Dank voor uw bericht. We kijken dit graag voor u na. Kunt u het ordernummer en uw postcode delen? Dan controleren we direct de status en koppelen we terug met een update.`;
  }
  if (t === "informeel") {
    return `Thanks voor je bericht! We checken het gelijk. Stuur je ordernummer en je postcode even mee? Dan geven we je snel een update 🙂`;
  }
  return `Dankjewel voor je bericht! Ik kijk dit meteen voor je na. Als je je ordernummer en postcode deelt, sturen we je snel een update.`;
}

// --- Dev self-tests (lichtgewicht) ---
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
      console.assert(typeof out === "string", `Output is not a string for ${c.type} / ${c.tone}`);
      console.assert(out.length > 20, `Output too short for ${c.type} / ${c.tone}`);
      if (c.type === "E-mail") {
        console.assert(out.startsWith("Onderwerp:"), `Email missing subject line for ${c.tone}`);
        if (/\d{4,}/.test(c.text)) {
          const num = extractOrderNumber(c.text);
          console.assert(new RegExp(`#${num}`).test(out), `Email subject missing #${num}`);
        }
        console.assert(/Blueline Customer Care/.test(out), `Email missing signature for ${c.tone}`);
      } else {
        console.assert(!out.startsWith("Onderwerp:"), `Social should not start with 'Onderwerp:' for ${c.tone}`);
      }
    });
    console.log("[Blueline Chatpilot] Self-tests passed ✅");
  } catch (err) {
    console.error("[Blueline Chatpilot] Self-tests failed ❌", err);
  }
}

// --- Copy helpers ---
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
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
        "inline-flex items-center gap-1.5 text-[11px] rounded-full px-2 py-1 border transition-colors",
        isCopied
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      )}
      aria-label={isCopied ? "Gekopieerd" : "Kopieer bericht"}
      title={isCopied ? "Gekopieerd" : "Kopieer bericht"}
    >
      {isCopied ? (
        // check icon
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
          <path d="M9 16.2l-3.5-3.5a1 1 0 10-1.4 1.4l4.2 4.2a1 1 0 001.4 0l10-10a1 1 0 10-1.4-1.4L9 16.2z" />
        </svg>
      ) : (
        // copy icon
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
          <path d="M16 1H6a2 2 0 00-2 2v12h2V3h10V1zm3 4H10a2 2 0 00-2 2v14a2 2 0 002 2h9a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H10V7h9v14z" />
        </svg>
      )}
      <span>{isCopied ? "Gekopieerd" : "Kopieer"}</span>
    </button>
  );
}

export default function BluelineChatpilot() {
  const TONES = ["Formeel", "Informeel"];

  const loaded = typeof window !== "undefined" ? safeLoad() : null;
  const [messageType, setMessageType] = useState(loaded?.messageType ?? "Social Media");
  const [tone, setTone] = useState(loaded?.tone ?? "Formeel");

  // Altijd starten met 1 dynamische begroeting (géén history laden)
  const [messages, setMessages] = useState([
    { role: "assistant", text: getGreeting(), meta: { type: "System", tone: "-" } },
  ]);

  // Copy state
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
  }, []);

  // Alleen messageType/tone bewaren (géén messages)
  useEffect(() => {
    safeSave({ messageType, tone });
  }, [messageType, tone]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed, meta: { type: messageType, tone } },
    ]);
    setInput("");
    if (inputRef.current) autoresizeTextarea(inputRef.current);

    try {
      const r = await fetch("/.netlify/functions/generate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: trimmed, type: messageType, tone }),
      });
      const data = await r.json();
      const reply = r.ok && data?.text
        ? data.text
        : generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone } },
      ]);
    } catch {
      const reply = generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone } },
      ]);
    }
  }

  const pillBase =
    "inline-flex items-center justify-center rounded-full h-8 px-4 text-sm transition-colors duration-200 select-none whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40";
  const pillActive = "bg-[#2563eb] text-white border border-[#2563eb] shadow-sm";
  const pillInactive =
    "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100";

  function handleCopied(id) {
    setCopiedId(id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f6f7fb] to-white text-gray-900">
      {/* MAIN CONTENT */}
      <div className="flex-1">
        <div className="mx-auto max-w-[760px] px-3 pt-6">
          {/* CARD / PANEL met GPT-achtige bodemruimte */}
          <div className="flex flex-col rounded-2xl border border-gray-200 shadow-lg bg-white h-[calc(100vh-1rem)]">
            {/* Sticky header binnen de kaart */}
            <header className="sticky top-0 z-10 border-b border-blue-600/20">
              <div className="bg-gradient-to-r from-[#2563eb] to-[#1e40af]">
                <div className="px-5 py-4 flex items-center gap-3">
                  <div aria-hidden className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#2563eb]" fill="currentColor">
                      <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0zm7.5-3.75a.75.75 0 011.5 0V12c0 .199-.079.39-.22.53l-2.75 2.75a.75.75 0 11-1.06-1.06l2.53-2.53V8.25z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold leading-tight text-white">Blueline Chatpilot</h1>
                    <p className="text-[13px] text-white/85 -mt-0.5">Jouw 24/7 assistent voor klantcontact.</p>
                  </div>
                </div>
              </div>
            </header>

            {/* Scrollbare messages (scrollbar verborgen) */}
            <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="px-5 py-5">
                <div className="flex flex-col gap-5" ref={listRef} role="log" aria-live="polite">
                  {messages.map((m, idx) => {
                    const isUser = m.role === "user";
                    const bubble = (
                      <div
                        className={cx(
                          "max-w-[560px] rounded-2xl shadow-sm px-5 py-4 text-[15px] leading-6 break-words",
                          isUser
                            ? "bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] text-white"
                            : "bg-gray-100 text-gray-900 border border-gray-200"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    );
                    const toolbar = (
                      <div className={cx("mt-1 flex", isUser ? "justify-end" : "justify-start")}>
                        <CopyButton
                          id={`msg-${idx}`}
                          text={m.text}
                          onCopied={handleCopied}
                          isCopied={copiedId === `msg-${idx}`}
                        />
                      </div>
                    );
                    return (
                      <div key={idx} className={cx("flex flex-col", isUser ? "items-end" : "items-start")}>
                        {bubble}
                        {toolbar}
                      </div>
                    );
                  })}
                </div>
              </div>
            </main>

            {/* Sticky dock onderaan binnen de kaart */}
            <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
              <div className="px-5 py-3">
                {/* Input row */}
                <form onSubmit={handleSend} aria-label="Bericht verzenden">
                  <div className="relative">
                    <label htmlFor="message" className="sr-only">Typ een bericht…</label>
                    <textarea
                      id="message"
                      ref={inputRef}
                      rows={1}
                      className="w-full bg-white border focus:outline-none focus:ring-2 focus:ring-[#2563eb]/25 focus:border-[#2563eb] px-4 pr-14 rounded-[12px] min-h-12 text-[15px] border-[#e5e7eb] placeholder-gray-400 resize-none leading-6 py-3 overflow-hidden transition-shadow"
                      placeholder="Typ een bericht…"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        autoresizeTextarea(e.target);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      aria-label="Bericht invoeren"
                      autoComplete="off"
                    />
                    {/* Send button: perfect gecentreerd */}
                    <button
                      type="submit"
                      aria-label="Verzenden"
                      disabled={!input.trim()}
                      className={cx(
                        "absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all duration-200",
                        (!input.trim())
                          ? "opacity-60 cursor-not-allowed"
                          : "hover:brightness-110 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40"
                      )}
                      style={{ backgroundColor: "#2563eb" }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                        <path d="M2.01 21l20-9L2.01 3 2 10l14 2-14 2z" />
                      </svg>
                    </button>
                  </div>
                </form>

                {/* Pills onder input */}
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Kanaal */}
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs font-medium text-gray-700 mr-1 sm:mr-2">Kanaal:</span>
                    {["Social Media", "E-mail"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setMessageType(t)}
                        className={cx(pillBase, messageType === t ? pillActive : pillInactive)}
                        aria-pressed={messageType === t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Stijl */}
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-xs font-medium text-gray-700 mr-1 sm:mr-2">Stijl:</span>
                    {["Formeel", "Informeel"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTone(t)}
                        className={cx(pillBase, tone === t ? pillActive : pillInactive)}
                        aria-pressed={tone === t}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* /Dock */}
          </div>

          {/* Disclaimer direct onder de kaart */}
          <div className="mt-2 text-center text-[12px] text-gray-500">
            Chatpilot kan fouten maken. Controleer belangrijke informatie.
          </div>
        </div>
      </div>
    </div>
  );
}
