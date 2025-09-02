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

function clampTemp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1.0, Math.max(0.1, n));
}

export default async (request) => {
  try {
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

    // Temperature: alleen ENV of default 0.4
    const envTemp =
      typeof process !== "undefined" &&
      process.env &&
      process.env.GEMINI_TEMPERATURE
        ? clampTemp(process.env.GEMINI_TEMPERATURE)
        : null;
    const temperature = envTemp ?? 0.4;

   const systemDirectives = `
Je bent de klantenservice-assistent van **Blueline Customer Care**. 
Je helpt CS-medewerkers en webshop-eigenaren bij het opstellen van klantvriendelijke antwoorden. 
Je schrijft altijd in het **Nederlands**.

Doel:
- Geef altijd een passend en klantvriendelijk antwoord.
- Herhaal of parafraseer de klantvraag nooit.
- Antwoord concreet en helder, met een logische vervolgstap of oplossing.
- Vermijd herhaling van standaardzinnen; varieer je formuleringen, ook bij vergelijkbare vragen.
- Gebruik je eigen inzicht om het meest logische antwoord te geven, afgestemd op de context.

Richtlijnen bij ordernummers:
- Als de klant een ordernummer noemt (bijv. #12345 of 12345), erken dit expliciet in je antwoord.
- Voor e-mail: gebruik het ordernummer in de onderwerpregel.
- Als er geen ordernummer is genoemd en het nodig is, vraag er vriendelijk om.

Stijlregels:
- Formeel: zakelijk, beleefd, geen emoji’s.
- Informeel: vriendelijk en luchtig, maximaal 2 emoji’s, spaarzaam gebruikt.

Output per type:

Social Media:
- Houd het kort en behulpzaam (1–2 zinnen).
- Geen onderwerpregel.
- Vraag alleen om gegevens (order, adres) als die echt nodig zijn.

E-mail:
Een volledige e-mail bevat:
1. Onderwerp:
   - Als er een ordernummer staat: "Vraag over order #<nummer>"
   - Zonder ordernummer: gebruik de kernwoorden uit de klantvraag (max. 3–5 woorden). 
     Kies altijd een zakelijke en neutrale formulering, bijv. "Vraag over levering bestelling", 
     "Vraag over retourzending", of "Vraag over productinformatie".
2. Aanhef:
   - Formeel: "Geachte [Naam],"
   - Informeel: "Hoi [Naam],"
3. Kernboodschap:
   - Kort en duidelijk antwoord of vervolgstap (80–140 woorden).
4. Afsluiting:
   - Formeel: "Met vriendelijke groet, Blueline Customer Care"
   - Informeel: "Groeten, Blueline Customer Care"

Valkuilen:
- Nooit de klanttekst herhalen of samenvatten.
- Houd de toon warm en professioneel, afgestemd op type en stijl.
- Geen meta-uitleg of systeemtekst; alleen de reactie naar de klant.
- Gebruik afwisseling in formuleringen om herhaling te voorkomen.
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
            { role: "user", parts: [{ text: fewshotSocialUser }] },
            { role: "model", parts: [{ text: fewshotSocialModel }] },
            { role: "user", parts: [{ text: fewshotEmailUser }] },
            { role: "model", parts: [{ text: fewshotEmailModel }] },
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
