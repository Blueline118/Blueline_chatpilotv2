import React, { useState } from "react";

// Helper to merge class names
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function BluelineChatpilot() {
  const [messageType, setMessageType] = useState("Social Media");
  const [tone, setTone] = useState("Vriendelijk");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "Welkom bij Blueline Chatpilot 👋 Hoe kan ik je vandaag helpen?",
    },
  ]);

  function handleSend(e) {
    e?.preventDefault();
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: input.trim(),
      },
    ]);
    setInput("");
  }

  const pillBase =
    "inline-flex items-center justify-center rounded-full h-8 px-4 text-sm transition-colors select-none whitespace-nowrap";
  const pillActive = "bg-[#2563eb] text-white border border-[#2563eb]";
  const pillInactive = "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50";

  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          {/* Logo: blauw rond icoon */}
          <div
            aria-hidden
            className="w-10 h-10 rounded-full bg-[#2563eb] flex items-center justify-center shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-white"
              fill="currentColor"
            >
              <path d="M3 12a9 9 0 1118 0 9 9 0 01-18 0zm7.5-3.75a.75.75 0 011.5 0V12c0 .199-.079.39-.22.53l-2.75 2.75a.75.75 0 11-1.06-1.06l2.53-2.53V8.25z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Blueline Chatpilot</h1>
            <p className="text-sm text-gray-600 -mt-0.5">
              Jouw 24/7 assistent voor klantcontact.
            </p>
          </div>
        </div>
      </header>

      {/* Chat Window */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mt-6 mb-36 rounded-xl" style={{ backgroundColor: "#f2f8ff" }}>
            <div className="p-4 sm:p-6">
              {/* Messages */}
              <div className="flex flex-col gap-4">
                {messages.map((m, idx) => (
                  <div key={idx} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}> 
                    <div
                      className={cx(
                        "max-w-[520px] rounded-2xl shadow-sm px-4 py-3 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-[#2563eb] text-white"
                          : "bg-white text-gray-900"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Dock */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200" style={{ backgroundColor: "#f9fafb" }}>
        <div className="mx-auto max-w-5xl px-4 py-3">
          {/* Top row: pill toggles */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Message type */}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-600 mr-1 sm:mr-2">Berichttype:</span>
              {["Social Media", "E-mail"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMessageType(t)}
                  className={cx(
                    pillBase,
                    messageType === t ? pillActive : pillInactive
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Tone */}
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-600 mr-1 sm:mr-2">Stijl:</span>
              {["Vriendelijk", "Formeel", "Informeel"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={cx(pillBase, tone === t ? pillActive : pillInactive)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom row: input + send button */}
          <form onSubmit={handleSend} className="mt-3">
            <div className="relative">
              {/* Input wrapper to allow button inside field */}
              <input
                type="text"
                className="w-full bg-white border focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 focus:border-[#2563eb] px-4 pr-14 rounded-[12px] h-12 text-sm border-[#e5e7eb] placeholder-gray-400"
                placeholder="Typ een bericht…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-label="Bericht invoeren"
              />
              {/* Send button inside the field (right aligned) */}
              <button
                type="submit"
                aria-label="Verzenden"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center shadow-sm transition-colors"
                style={{ backgroundColor: "#2563eb" }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-white"
                >
                  <path d="M2.01 21l20-9L2.01 3 2 10l14 2-14 2z" />
                </svg>
              </button>
            </div>
            {/* Context hint below input */}
            <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-2">
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
