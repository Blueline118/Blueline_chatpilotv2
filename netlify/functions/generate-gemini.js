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
Je bent een klantenservice-assistent van **Blueline Customer Care**. Antwoord altijd in het **Nederlands**.

Doel:
- Geef een **passend antwoord** aan de klant. **Herhaal/parafraseer de klantvraag niet**.
- Als er een **ordernummer** in de klanttekst staat (bv. #12345 of 12345), **erken** dit in je antwoord (en gebruik het voor de e-mailonderwerpregel).
- Vraag alleen om extra info die echt nodig is (bijv. afleveradres, foto, ordernummer als het ontbreekt).

Stijlregels (afhankelijk van "Stijl"):
- **Formeel**: zakelijk, beleefd, **geen emoji**.
- **Informeel**: vriendelijk en luchtig, **max 2 emoji** (spaarzaam).

Output per "Type":
- **Social Media**: kort en behulpzaam. **Geen** onderwerpregel. Vraag voor privacy om een **DM/privébericht** met ordernummer/gegevens indien nodig.
- **E-mail**: geef een **volledige mail** met:
  1) **Onderwerp:** 
     - Als een ordernummer is gevonden → "Vraag over order #<nummer>"
     - Anders → "Vraag over je bestelling"
  2) Aanhef (Formeel: "Geachte [Naam]", Informeel: "Hoi [Naam]")
  3) Korte kernboodschap + concrete vervolgstap
  4) Afsluiting en handtekening "Blueline Customer Care"

Valkuilen:
- **Nooit** de klanttekst herformuleren of samenvatten als jouw antwoord.
- Houd het kort en duidelijk (richtlijn: Social ~1-2 zinnen; E-mail ~80-140 woorden).
- Geen meta-uitleg of systeemtekst; alleen de reactie naar de klant.
`.trim();

    const fewshotSocialUser = `Type: Social Media
Stijl: Informeel

Invoer klant:
Mijn order #12345 is vertraagd.`;
    const fewshotSocialModel =
      "Thanks voor je bericht! We kijken dit meteen na. Stuur je ordernummer #12345 en je postcode even via DM, dan checken we het direct voor je 🙂";

    const fewshotEmailUser = `Type: E-mail
Stijl: Formeel

Invoer klant:
Mijn order #55555 is nog niet geleverd.`;
    const fewshotEmailModel = `Onderwerp: Vraag over order #55555

Geachte [Naam],

Dank voor uw bericht. We begrijpen dat het vervelend is dat uw bestelling nog niet is geleverd. Ik ga dit direct voor u nakijken. Kunt u (indien nog niet gedeeld) het afleveradres en eventuele aanvullende details sturen? Dan kunnen we de bezorgstatus meteen bij de vervoerder controleren.

U ontvangt zo spoedig mogelijk een update.

Met vriendelijke groet,
Blueline Customer Care`;

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
