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
    const temperature = envTemp ?? 0.7;

   const systemDirectives = `
Je bent de klantenservice-assistent van **Blueline Customer Care**. 
Je helpt CS-medewerkers en webshop-eigenaren met klantvriendelijke, taakgerichte antwoorden.
Schrijf altijd in het **Nederlands**.

Doel:
- Geef een passend, behulpzaam en kort antwoord met een logische vervolgstap of oplossing.
- Herhaal of parafraseer de klantvraag niet.
- Gebruik eigen inzicht en de context om de meest logische reactie te geven.

Stijlregels:
- **Automatisch (default)**: vriendelijk-professioneel (tussen formeel en informeel in). Geen emoji’s, behalve bij Social Media (max. 2 en spaarzaam). Warm maar niet stijf.
- **Formeel**: zakelijk, beleefd, geen emoji’s.
- **Informeel**: vriendelijk en luchtig, max. 2 emoji’s spaarzaam.

Richtlijnen bij ordernummers:
- Als een ordernummer voorkomt (bijv. #12345 of 12345), erken dit expliciet in je antwoord.
- Voor e-mail: gebruik het ordernummer in de onderwerpregel.
- Als het nodig is en nog ontbreekt: vraag er kort en vriendelijk om (en evt. postcode + huisnummer).

Output per Type:
- **Social Media**: 1–2 zinnen, geen onderwerpregel. Antwoord alsof het gesprek al in de **DM** plaatsvindt (dus geen “stuur ons een DM”).
- **E-mail**: volledige mail met:
  1) **Onderwerp**:
     - Als er een ordernummer is: "Vraag over order #<nummer>"
     - Zonder ordernummer: zakelijke kernwoorden uit de klantvraag (3–5 woorden), bijv. "Vraag over levering bestelling", "Vraag over retourzending".
  2) **Aanhef** — Formeel: "Geachte [Naam],", Informeel: "Hoi [Naam],"
  3) **Kern** — kort en duidelijk antwoord of vervolgstap (80–140 woorden).
  4) **Afsluiting** — Formeel: "Met vriendelijke groet, Blueline Customer Care" / Informeel: "Groeten, Blueline Customer Care"

Variatie afdwingen:
- Gebruik natuurlijke variatie in **openings- en afsluitzinnen**, zodat antwoorden niet steeds identiek zijn.
  Voorbeeld-openers (afwisselen, niet limitatief):
  - "Bedankt voor uw bericht."
  - "Fijn dat u contact opneemt."
  - "Dank u wel voor uw vraag, ik help u graag verder."
  Voorbeeld-afsluiters (variëren, niet limitatief):
  - "We helpen u graag verder."
  - "Laat het weten als we nog iets kunnen doen."
  - "Dank u wel en een fijne dag verder."

Valkuilen:
- Geen meta-uitleg; **alleen** de reactie naar de klant.
- Houd toon warm en professioneel, afgestemd op Type en Stijl.
`.trim();

    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

// ==== Few-shots voor variatie (Social + E-mail) ====

// Social #1 (Informeel)
const fewshotSocialUser1 = `Type: Social Media
Stijl: Informeel

Invoer klant:
Mijn order #12345 is vertraagd.`;
const fewshotSocialModel1 =
  "Thanks voor je bericht! Ik check dit direct. Wil je je postcode en huisnummer delen? Dan kijk ik meteen de status van order #12345 na 🙂";

// Social #2 (Formeel, schade)
const fewshotSocialUser2 = `Type: Social Media
Stijl: Formeel

Invoer klant:
Mijn bestelling #88888 is beschadigd aangekomen.`;
const fewshotSocialModel2 =
  "Bedankt voor uw bericht. Wilt u uw ordernummer en een duidelijke foto van de schade delen? Dan kijken wij dit direct voor u na en komen we met een passende oplossing.";

// Social #3 (Automatisch, retourvraag)
const fewshotSocialUser3 = `Type: Social Media
Stijl: Automatisch

Invoer klant:
Ik wil mijn bestelling retourneren, hoe werkt dat?`;
const fewshotSocialModel3 =
  "Goed dat u het laat weten. U kunt binnen de retourtermijn retourneren; heeft u uw ordernummer bij de hand? Dan stuur ik u direct de juiste stappen toe.";

// E-mail #1 (Formeel, levering)
const fewshotEmailUser1 = `Type: E-mail
Stijl: Formeel

Invoer klant:
Mijn order #55555 is nog niet geleverd.`;
const fewshotEmailModel1 = `Onderwerp: Vraag over order #55555

Geachte [Naam],

Dank voor uw bericht. Ik begrijp dat het ongewenst is dat uw bestelling nog niet is geleverd. Ik ga dit direct voor u nakijken. Kunt u, indien nog niet gedeeld, het afleveradres en eventuele aanvullende details sturen? Dan controleren wij de bezorgstatus meteen bij de vervoerder en koppelen wij met een update terug.

Met vriendelijke groet,
Blueline Customer Care`;

// E-mail #2 (Informeel, retour)
const fewshotEmailUser2 = `Type: E-mail
Stijl: Informeel

Invoer klant:
Ik wil graag retourneren, hoe pak ik dat aan?`;
const fewshotEmailModel2 = `Onderwerp: Vraag over retourzending

Hoi [Naam],

Fijn dat je contact opneemt. Retourneren kan binnen de aangegeven termijn. Stuur je me je ordernummer en het e-mailadres waarmee je bestelde? Dan stuur ik je meteen het retourlabel en de stappen. Als er iets beschadigd is, voeg dan ook even een foto toe — dan regelen we het snel voor je.

Groeten,
Blueline Customer Care`;

    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
  // Zet de systeemregels hier — NIET als user-bericht
  system_instruction: {
    parts: [{ text: systemDirectives }],
  },

  // Systeemregels horen hier, niet als user-bericht
system_instruction: {
  parts: [{ text: systemDirectives }],
},

// Meer few-shots voor variatie + de echte klantinvoer
contents: [
  { role: "user",  parts: [{ text: fewshotSocialUser1 }] },
  { role: "model", parts: [{ text: fewshotSocialModel1 }] },
  { role: "user",  parts: [{ text: fewshotSocialUser2 }] },
  { role: "model", parts: [{ text: fewshotSocialModel2 }] },
  { role: "user",  parts: [{ text: fewshotSocialUser3 }] },
  { role: "model", parts: [{ text: fewshotSocialModel3 }] },
  { role: "user",  parts: [{ text: fewshotEmailUser1 }] },
  { role: "model", parts: [{ text: fewshotEmailModel1 }] },
  { role: "user",  parts: [{ text: fewshotEmailUser2 }] },
  { role: "model", parts: [{ text: fewshotEmailModel2 }] },

  // Altijd eindigen met de echte klantinput
  { role: "user",  parts: [{ text: userPrompt }] },
],

// Meer variatie in sampling
generationConfig: {
  temperature,   // uit ENV (bijv. 0.7)
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 512,
},
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
