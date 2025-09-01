// netlify/functions/generate-gemini.js
const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// Helper om temperature veilig te lezen en te begrenzen
function clampTemp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Begrens tussen 0.1 en 1.0
  return Math.min(1.0, Math.max(0.1, n));
}

export default async (request) => {
  try {
    // Ping: GET /.netlify/functions/generate-gemini?ping=1
    const url = new URL(request.url);
    if (url.searchParams.get("ping")) {
      return new Response(JSON.stringify({ ok: true, pong: true }), {
        headers: JSON_HEADERS,
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    // Body lezen (en robuust omgaan met lege/ongeldige JSON)
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const { userText, type, tone } = payload || {};
    if (!userText || !type || !tone) {
      return new Response(
        JSON.stringify({ error: "Missing fields (userText, type, tone)" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 12000);

    // Temperature bepalen: eerst per-request (UI), dan ENV, dan default 0.7
    const bodyTemp = clampTemp(payload?.temperature);
    const envTemp =
      typeof process !== "undefined" &&
      process.env &&
      process.env.GEMINI_TEMPERATURE
        ? clampTemp(process.env.GEMINI_TEMPERATURE)
        : null;
    const temperature = bodyTemp ?? envTemp ?? 0.7;

    // Instructies voor het model
    const systemDirectives = `
Schrijf in het Nederlands.
Als type == "Social Media": gebruik vaste sjablonen (geen onderwerpregel). Vraag om DM/privé met ordernummer.
Als type == "E-mail": genereer een volledige mail met onderwerpregel.
  - Als de usertekst een ordernummer bevat (bv. #12345 of 12345), maak onderwerp: "Vraag over order #<nummer>".
  - Anders: "Vraag over je bestelling".
"Formeel": zakelijke toon, geen emoji.
"Informeel": informele toon met max 2 emoji (spaarzaam).
Beperk je tot de reactie zelf; geen meta-uitleg.
`.trim();

    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemDirectives }] },
            { role: "user", parts: [{ text: userPrompt }] },
          ],
          generationConfig: { temperature, maxOutputTokens: 512 },
        }),
      }),
      timeoutMs
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: "Gemini error",
          hint: "Controleer je invoer of probeer het zo nog eens.",
          upstreamStatus: resp.status,
          details: errText,
        }),
        { status: resp.status, headers: JSON_HEADERS }
      );
    }

    const data = await resp.json().catch(() => ({}));
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Er is geen tekst gegenereerd.";

    return new Response(JSON.stringify({ text }), { headers: JSON_HEADERS });
  } catch (e) {
    if (e && e.message === "Timeout") {
      return new Response(
        JSON.stringify({
          error: "Timeout",
          hint: "De AI deed er te lang over. Probeer het zo nog eens of versmal je vraag.",
        }),
        { status: 408, headers: JSON_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({ error: e?.message || "Unknown error" }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
};
