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

// Hulpfunctie: onderwerpregel verwijderen als model toch eigenwijs is
function stripSubjectLine(s) {
  if (typeof s !== "string") return s;
  // Verwijder regels die met “Onderwerp:” beginnen (case-insensitive, whitespace ok)
  return s.replace(/^[ \t]*onderwerp\s*:.*$/gim, "").trim();
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

    // Bodyvelden (profileKey is optioneel)
    const {
      userText,
      type,
      tone,
      profileKey = "default", // "default" | "merrachi" | ...
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

    // Temperature: tijdelijk hard op 0.7 (ENV omzeild om zeker te zijn)
    const temperature = 0.7;
    // // Wil je later ENV gebruiken?:
    // // const envTemp = process?.env?.GEMINI_TEMPERATURE ? clampTemp(process.env.GEMINI_TEMPERATURE) : null;
    // // const temperature = envTemp ?? 0.7;

    /* ---------- Systeemprompt (los, zonder onderwerpregel) ---------- */
    const systemDirectives = `
Je bent de klantenservice-assistent van **Blueline Customer Care** (e-commerce/fashion).
Schrijf in het **Nederlands** en klink **vriendelijk-professioneel** (menselijk, empathisch, behulpzaam).

Richtlijnen:
- **Social Media**: kort (1–2 zinnen) en gevarieerd in formuleringen. Max. 1 emoji en alleen als passend.
- **E-mail**: 2–3 korte alinea’s (±80–140 woorden). **Schrijf NOOIT een onderwerpregel** en zet **NOOIT** een regel die begint met “Onderwerp:”.
- Erken de situatie van de klant. Vraag alleen om gegevens als die relevant zijn (bijv. ordernummer, foto bij schade, adres voor leveringscheck).
- Varieer natuurlijk in aanhef en afsluiting (vermijd herhaalde standaardzinnen).
- Geen meta-uitleg of systeemtekst; schrijf uitsluitend het antwoord voor de klant.
- Reageer alsof je al in een DM zit (dus niet “stuur ons een DM”).
`.trim();

    /* ---------- Klantprofielen: zachte hints ---------- */
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
      merrachi: {
        display: "Merrachi",
        toneHints: ["inspirerend", "empowerend", "respectvol"],
        styleRules: ["korte zinnen", "verfijnde toon", "duidelijk en inclusief"],
        lexicon: { prefer: ["collectie", "maat", "retourneren"], avoid: ["RMA", "order-ID"] },
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
        `Kennis (alleen indien relevant, kort):`,
        ...p.knowledge.map((k) => `- ${k}`),
      ].join("\n");
    }

    // Finale systeemprompt = basis + profielhints
    const finalSystem = [systemDirectives, buildProfileDirectives(profileKey)].join("\n\n");

    // User prompt (zoals jij al hanteert)
    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    /* ---------- API call ---------- */
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          // Systeemprompt op de juiste plek (MET profielhints)
          system_instruction: {
            parts: [{ text: finalSystem }],
          },

          // Géén fewshots — alleen de echte klantinvoer
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],

          // Sampling voor variatie (maar beheerst)
          generationConfig: {
            temperature,         // 0.7
            topP: 0.95,
            topK: 50,
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
          upstreamStatus: resp.status,
          details: errText,
        }),
        { status: resp.status, headers: JSON_HEADERS }
      );
    }

    const data = await resp.json().catch(() => ({}));
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Er is geen tekst gegenereerd.";

    const text = stripSubjectLine(rawText);

    return new Response(
      JSON.stringify({
        text,
        meta: { source: "model", temperature, topP: 0.95, topK: 50, profileKey },
      }),
      { headers: JSON_HEADERS }
    );
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
