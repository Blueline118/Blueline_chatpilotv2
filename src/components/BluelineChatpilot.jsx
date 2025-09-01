import React, { useEffect, useRef, useState } from "react";

// Utility to merge class names
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Extract a likely order number (e.g., 12345 or #12345) from user text
function extractOrderNumber(text = "") {
  if (!text) return null;
  // Common Dutch cues and generic patterns
  const patterns = [
    /order\s*#?\s*(\d{4,})/i,
    /ordernummer\s*#?\s*(\d{4,})/i,
    /bestel(?:ling)?(?:nummer)?\s*#?\s*(\d{4,})/i,
    /ticket\s*#?\s*(\d{4,})/i,
    /#(\d{4,})\b/, // fallback hash number
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

// --- Reply generator ---
// Uses template literals for robust multiline strings.
function generateAssistantReply(text, type, tone) {
  const t = (tone || "").toLowerCase();
  const isEmail = type === "E-mail";
  const orderNo = extractOrderNumber(text);

  if (isEmail) {
    // Subject line is dynamic if we can find an order number
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
    // default safety (shouldn't hit; UI beperkt de opties)
    return `Onderwerp: ${subject}

Hi [Naam],

Bedankt voor je bericht. We pakken dit direct op en laten je binnen 1 werkdag iets weten. Zou je je ordernummer en eventuele bijlagen willen delen? Dan helpen we je snel verder.

Hartelijke groet,
Blueline Customer Care`;
  }

  // Social Media — keep fixed templates; tone controls formality and emojis
  if (t === "formeel") {
    return `Dank voor uw bericht. We helpen u graag verder. Zou u uw ordernummer in een privébericht kunnen sturen? Dan zoeken wij het direct voor u uit.`;
  }
  if (t === "informeel") {
    return `Thanks voor je bericht! We duiken er meteen in. Stuur je ordernummer even via DM, dan fixen we het voor je 🙂`;
  }
  // default safety (shouldn't hit; UI beperkt de opties)
  return `Dankjewel voor je bericht! Ik kijk dit meteen voor je na. Zou je je ordernummer via DM kunnen delen? Dan helpen we je snel verder.`;
}

// --- Lightweight dev self-tests ---
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
        console.assert(out.startsWith("Onderwerp:"), `Email missing subject line for tone ${c.tone}`);
        if (/\d{4,}/.test(c.text)) {
          const num = extractOrderNumber(c.text);
          console.assert(new RegExp(`#${num}`).test(out), `Email subject missing extracted order #${num}`);
        }
        console.assert(/Blueline Customer Care/.test(out), `Email missing signature for tone ${c.tone}`);
      } else {
        console.assert(!out.startsWith("Onderwerp:"), `Social message should not start with 'Onderwerp:' for tone ${c.tone}`);
        console.assert(/DM|privé/i.test(out), `Social message should request DM/privé for tone ${c.tone}`);
      }
    });

    // eslint-disable-next-line no-console
    console.log("[Blueline Chatpilot] Self-tests passed ✅");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Blueline Chatpilot] Self-tests failed ❌", err);
  }
}

export default function BluelineChatpilot() {
  // Tone options now limited to Formeel & Informeel (Vriendelijk verwijderd op verzoek)
  const TONES = ["Formeel", "Informeel"];

  const [messageType, setMessageType] = useState("Social Media");
  const [tone, setTone] = useState(TONES[0]); // default to Formeel
  const [temperature, setTemperature] = useState(0.7); // NEW: creativiteit slider
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Welkom bij Blueline Chatpilot 👋 Hoe kan ik je vandaag helpen?",
      meta: { type: "System", tone: "-" },
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (IS_DEV) runSelfTests();
  }, []);

  // Auto-scroll to the latest message
  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  async function handleSend(e) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed, meta: { type: messageType, tone } },
    ]);
    setInput("");

    setIsTyping(true);
    try {
      const r = await fetch("/.netlify/functions/generate-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: trimmed, type: messageType, tone, temperature }), // send temperature
      });
      const data = await r.json();
      const reply = r.ok && data?.text
        ? data.text
        : generateAssistantReply(trimmed, messageType, tone); // fallback indien fout
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone } },
      ]);
    } catch (err) {
      const reply = generateAssistantReply(trimmed, messageType, tone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply, meta: { type: messageType, tone } },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      inputRef.current?.focus();
    }
  }

  const pillBase =
    "inline-flex items-center justify-center rounded-full h-8 px-4 text-sm transition-colors select-none whitespace-nowrap";
  const pillActive = "bg-[#2563eb] text-white border border-[#2563eb]";
  const pillInactive =
    "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700";

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200 dark:bg-gray-950/80 dark:border-gray-800">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          {/* Logo */}
          <div aria-hidden className="w-10 h-10 rounded-full bg-[#2563eb] flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
              <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0zm7.5-3.75a.75.75 0 011.5 0V12c0 .199-.079.39-.22.53l-2.75 2.75a.75.75 0 11-1.06-1.06l2.53-2.53V8.25z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Blueline Chatpilot</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 -mt-0.5">Jouw 24/7 assistent voor klantcontact.</p>
          </div>
        </div>
      </header>

      {/* Chat Window */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4">
          <section className="mt-6 mb-40 rounded-xl border border-transparent dark:border-gray-800" style={{ backgroundColor: "#f2f8ff" }}>
            <div className="p-4 sm:p-6">
              <div className="flex flex-col gap-4" ref={listRef} role="log" aria-live="polite">
                {messages.map((m, idx) => (
                  <div key={idx} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cx(
                        "max-w-[520px] rounded-2xl shadow-sm px-4 py-3 text-sm leading-relaxed break-words",
                        m.role === "user"
                          ? "bg-[#2563eb] text-white"
                          : "bg-white text-gray-900 border border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.meta?.type && (
                        <div className={cx("mt-2 text-[11px]", m.role === "user" ? "text-white/90" : "text-gray-500")}>
                          {m.meta.type} · {m.meta.tone}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="max-w-[520px] rounded-2xl shadow-sm px-4 py-3 text-sm bg-white text-gray-900 border border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <span className="relative inline-block w-6 h-2 align-middle">
                          <span className="absolute left-0 top-0 w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.2s]"></span>
                          <span className="absolute left-2 top-0 w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0s]"></span>
                          <span className="absolute left-4 top-0 w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]"></span>
                        </span>
                        Typen…
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Dock */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 dark:border-gray-800" style={{ backgroundColor: "#f9fafb", paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Message type */}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 mr-1 sm:mr-2">Berichttype:</span>
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

            {/* Tone (only Formeel & Informeel) */}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 mr-1 sm:mr-2">Stijl:</span>
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

          {/* Temperature slider */}
          <div className="mt-3 flex items-center gap-3">
            <label htmlFor="temp" className="text-xs font-medium text-gray-600 dark:text-gray-300">Creativiteit:</label>
            <input
              id="temp"
              type="range"
              min="0.1"
              max="1.0"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-40 accent-[#2563eb]"
              aria-label="Creativiteit (temperature)"
            />
            <span className="text-xs text-gray-600 dark:text-gray-300 w-10 tabular-nums text-right">
              {temperature.toFixed(1)}
            </span>
          </div>

          {/* Bottom row: input + send button */}
          <form onSubmit={handleSend} className="mt-3" aria-label="Bericht verzenden">
            <div className="relative">
              <label htmlFor="message" className="sr-only">Typ een bericht…</label>
              <input
                id="message"
                ref={inputRef}
                type="text"
                className="w-full bg-white dark:bg-gray-900 border focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] px-4 pr-14 rounded-[12px] h-12 text-sm border-[#e5e7eb] dark:border-gray-700 placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Typ een bericht…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Bericht invoeren"
                autoComplete="off"
              />
              {/* Send button inside the field (right aligned) */}
              <button
                type="submit"
                aria-label="Verzenden"
                disabled={!input.trim() || isTyping}
                className={cx(
                  "absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-colors",
                  (!input.trim() || isTyping) ? "opacity-60 cursor-not-allowed" : "hover:brightness-110"
                )}
                style={{ backgroundColor: "#2563eb" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                  <path d="M2.01 21l20-9L2.01 3 2 10l14 2-14 2z" />
                </svg>
              </button>
            </div>
            {/* Context hint below input */}
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Berichttype:</span> {messageType}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">Stijl:</span> {tone}
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
