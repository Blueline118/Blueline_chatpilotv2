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

    // Lees velden uit de body (profileKey toegevoegd)
    const {
      userText,
      type,
      tone,
      profileKey = "default", // "default" of "merrachi"
    } = payload || {};

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

    // Temperature: ENV of default 0.7
    const envTemp =
      typeof process !== "undefined" &&
      process.env &&
      process.env.GEMINI_TEMPERATURE
        ? clampTemp(process.env.GEMINI_TEMPERATURE)
        : null;
    const temperature = envTemp ?? 0.7;

    /* ---------- Minimalistische system prompt (niet knijpen) ---------- */
    const systemDirectives = `
Je bent een klantenservice-assistent voor **Blueline Customer Care**, actief in e-commerce en webshops (o.a. fashion en aanverwante niches).
Schrijf altijd in het **Nederlands**.

Doel & stijl:
- Antwoord vriendelijk-professioneel: menselijk, empathisch, behulpzaam.
- Reageer kort en duidelijk op **Social Media** (1–2 zinnen).
- Reageer iets uitgebreider bij **E-mail** (2–3 alinea’s, ~80–140 woorden).
- **Geen onderwerpregel** (het ticketsysteem levert die al).
- Vraag alleen om ordernummer of aanvullende gegevens als dat nodig is (bijv. retour, schade, levertijd).
- **Varieer** natuurlijk in aanhef, kernboodschap en afsluiting; vermijd herhaalde standaardzinnen.
- Reageer alsof je al in een DM zit (dus niet “stuur ons een DM”).
`.trim();

    // User prompt blijft zoals bij jou
    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    /* ---------- Klantprofielen (lichte hints, niet knijpen) ---------- */
    const PROFILES = {
      default: {
        display: "Standaard",
        toneHints: ["vriendelijk-professioneel", "empathisch", "duidelijk"],
        styleRules: ["korte zinnen", "geen jargon", "positief geformuleerd"],
        lexicon: { prefer: ["bestelling", "retour", "bevestiging"], avoid: ["ticket", "case", "RMA"] },
        knowledge: [
          "Retourtermijn: 30 dagen (NL/BE).",
          "Gratis retour bij schade of verkeerde levering.",
        ],
      },

      // Klantprofiel 1 — Merrachi
      merrachi: {
        display: "Merrachi",
        toneHints: ["inspirerend", "empowerend", "respectvol"],
        styleRules: ["korte zinnen", "verfijnde toon", "duidelijk en inclusief"],
        lexicon: {
          prefer: ["collectie", "maat", "retourneren"],
          avoid: ["RMA", "order-ID"],
        },
        knowledge: [
          "Wereldwijde verzending binnen 2–5 dagen.",
          "Retourneren toegestaan binnen 14 dagen.",
          "Collecties geïnspireerd door cultuur en bescheidenheid.",
          "Maten ontworpen voor comfort en zelfvertrouwen.",
          "Gebruik maattabel bij pasvorm-vragen.",
          "Veilige betaalmethoden wereldwijd beschikbaar.",
          "Duurzame materialen zorgvuldig geselecteerd.",
          "Speciale collecties tijdens Ramadan.",
          "Klantenservice dagelijks bereikbaar.",
          "Focus op elegantie en vrouwelijk zelfvertrouwen.",
        ],
      },
    };

    function buildProfileDirectives(key) {
      const p = PROFILES[key] || PROFILES.default;
      return [
        `Profiel: ${p.display}`,
        `Toon-hints: ${p.toneHints.join(", ")}`,
        `Stijl: ${p.styleRules.join(", ")}`,
        `Terminologie — verkies: ${p.lexicon.prefer.join(", ")}; vermijd: ${p.lexicon.avoid.join(", ")}`,
        `Kennis (kort en alleen indien relevant):`,
        ...p.knowledge.map((k) => `- ${k}`),
      ].join("\n");
    }

    // Finale system prompt = basis + zachte profiel-hints
    const finalSystem = [systemDirectives, buildProfileDirectives(profileKey)].join("\n\n");

    /* ---------- API call ---------- */
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          // Systeemregels (één keer, niet als user-bericht)
          system_instruction: {
            parts: [{ text: finalSystem }],
          },

          // Alleen de echte klantinvoer
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],

          // Sampling voor variatie
          generationConfig: {
            temperature, // bijv. 0.7 via ENV
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
