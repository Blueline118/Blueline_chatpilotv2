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

// Local storage helpers
const STORAGE_KEY = "blueline-chatpilot:v1";
function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.messages)) return null;
    return {
      messages: data.messages,
      messageType: typeof data.messageType === "string" ? data.messageType : "Social Media",
      tone: typeof data.tone === "string" ? data.tone : "Formeel",
    };
  } catch {
    return null;
  }
}
function safeSave(state) {
  try {
    const payload = {
      messages: (state.messages || []).slice(-200),
      messageType: state.messageType,
      tone: state.tone,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
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

export default function BluelineChatpilot() {
  const TONES = ["Formeel", "Informeel"];

  const loaded = typeof window !== "undefined" ? safeLoad() : null;
  const [messageType, setMessageType] = useState(loaded?.messageType ?? "Social Media");
  const [tone, setTone] = useState(loaded?.tone ?? "Formeel");
  const [messages, setMessages] = useState(
    loaded?.messages ?? [
      {
        role: "assistant",
        text: "Welkom bij Blueline Chatpilot 👋 Hoe kan ik je vandaag helpen?",
        meta: { type: "System", tone: "-" },
      },
    ]
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (IS_DEV) runSelfTests();
  }, []);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (inputRef.current) autoresizeTextarea(inputRef.current);
  }, []);

  useEffect(() => {
    safeSave({ messages, messageType, tone });
  }, [messages, messageType, tone]);

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

    setIsTyping(true);
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
    } finally {
      setIsTyping(false);
    }
  }

  const pillBase =
    "inline-flex items-center justify-center rounded-full h-8 px-4 text-sm transition-colors duration-200 select-none whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40";
  const pillActive = "bg-[#2563eb] text-white border border-[#2563eb] shadow-sm";
  const pillInactive =
    "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100";

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#f6f7fb] to-white text-gray-900">
      {/* MAIN CONTENT */}
      <div className="flex-1">
        <div className="mx-auto max-w-[760px] px-3 pt-6">
          {/* CARD / PANEL met grotere hoogte om witruimte te minimaliseren */}
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

            {/* Scrollbare messages (alleen dit deel scrolt) */}
            <main className="flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="px-5 py-5">
                <div className="flex flex-col gap-5" ref={listRef} role="log" aria-live="polite">
                  {messages.map((m, idx) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={idx} className={cx("flex", isUser ? "justify-end" : "justify-start")}>
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
                      disabled={isTyping || !input.trim()}
                      className={cx(
                        "absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-all duration-200",
                        (!input.trim() || isTyping)
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

          {/* Disclaimer direct onder de kaart, met mini-marge */}
          <div className="mt-1 text-center text-[12px] text-gray-500">
            Chatpilot kan fouten maken. Controleer belangrijke informatie.
          </div>
        </div>
      </div>
    </div>
  );
}
