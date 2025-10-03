// netlify/functions/generate-gemini.js
// ============================================================================
// Blueline Chatpilot – Gemini gateway (REST v1)
// - Model/endpoint via env (GEMINI_MODEL, GEMINI_API_BASE)
// - Stuurt 1-turn prompt met system + user naar /v1/models/...:generateContent
// - BELANGRIJK: v1 gebruikt camelCase keys: systemInstruction, generationConfig
// ============================================================================

// ────────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────────
const MODEL =
  process.env.GEMINI_MODEL ||
  // kies zelf: "gemini-1.5-pro" of "gemini-1.5-flash-latest"
  "gemini-1.5-pro";

const API_BASE =
  process.env.GEMINI_API_BASE ||
  // REST v1 (niet v1beta)
  "https://generativelanguage.googleapis.com/v1";

const API_URL = `${API_BASE}/models/${MODEL}:generateContent`;

// ────────────────────────────────────────────────────────────────────────────────
/** Race helper om API-calls te begrenzen */
function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Optioneel: temp clamp (nu niet gebruikt – temperatuur forceren we op 0.7) */
function clampTemp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1.0, Math.max(0.1, n));
}

/** Verwijder “Onderwerp:” / “Subject:” regels in allerlei varianten
 *  (ook **Onderwerp:**, en/dash, bullets, NBSP, markdown) */
function stripSubjectLine(s) {
  if (typeof s !== "string") return s;
  const lines = s.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    const l = line
      .replace(/\u00A0/g, " ") // NBSP -> spatie
      .replace(/[*_~`>•\-–—]+/g, (m) => m); // laat opmaak staan; we checken startwoord
    // Match: start met Onderwerp/Subject (case-insensitive), gevolgd door optionele spaties en (:|–|—|-)
    return !/^\s*(onderwerp|subject)\s*[:–—-]/i.test(l);
  });
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ────────────────────────────────────────────────────────────────────────────────
// HTTP handler (Netlify Functions ESM default export)
// ────────────────────────────────────────────────────────────────────────────────
export default async (request) => {
  try {
    // Health check /ping
    const url = new URL(request.url);
    if (url.searchParams.get("ping")) {
      return new Response(JSON.stringify({ ok: true, pong: true }), {
        headers: JSON_HEADERS,
      });
    }

    // Alleen POST toestaan
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    // Body-parsing (safe)
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    // Minimale velden die de UI vandaag stuurt
    const { userText, type, tone, profileKey = "default" } = payload || {};

    // Simpele validatie
    if (!userText || !type || !tone) {
      return new Response(
        JSON.stringify({ error: "Missing fields (userText, type, tone)" }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // API key check
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    // Voor nu hard op 0.7 zodat ENV je niet knijpt tijdens testen
    const temperature = 0.7;
    // (Als je dit via env wil doen, kun je clampTemp(process.env.GEMINI_TEMPERATURE) toepassen)

    // ────────────────────────────────────────────────────────────────────────────
    // System directives + profiel hints (identiek aan je huidige logica)
    // ────────────────────────────────────────────────────────────────────────────
    const systemDirectives = `
Je bent de klantenservice-assistent van **Blueline Customer Care** (e-commerce/fashion).
Schrijf in het **Nederlands** en klink **vriendelijk-professioneel** (menselijk, empathisch, behulpzaam).

Algemene richtlijnen:
- **Social Media**: 1–2 zinnen, varieer formuleringen, maximaal 1 passende emoji.
- **E-mail**: 2–3 korte alinea’s (±80–140 woorden). **Schrijf GEEN onderwerpregel** en **geen regel die begint met “Onderwerp:” of “Subject:”.**
- Erken de situatie van de klant en geef, waar mogelijk, direct antwoord. Geen meta-uitleg.

Vraag- & gegevenslogica:
- **Beschikbaarheid / productinfo**: geef direct info of stel gerichte vragen (bijv. gewenste **maat/kleur/model**). **Vraag GEEN ordernummer.**
- **Leverstatus / vertraagd / niet ontvangen**: vraag **ordernummer + postcode + huisnummer** (alleen indien nodig).
- **Schade / defect**: vraag **foto + ordernummer** (alleen indien nodig).
- **Retour/ruil**: licht kort de procedure toe; vraag pas om gegevens als het écht nodig is.

Stijl:
- Varieer natuurlijk in aanhef en afsluiting; vermijd herhaalde standaardzinnen.
- Reageer alsof je al in een DM zit (dus niet “stuur ons een DM”).
`.trim();

    /** Klantprofielen: zachte hints (niet knijpen) */
    const PROFILES = {
      default: {
        display: "Standaard",
        toneHints: ["vriendelijk-professioneel", "empathisch", "duidelijk"],
        styleRules: ["korte zinnen", "geen jargon", "positief geformuleerd"],
        lexicon: {
          prefer: ["bestelling", "retour", "bevestiging"],
          avoid: ["ticket", "case", "RMA"],
        },
        knowledge: [
          "Retourtermijn: 30 dagen (NL/BE).",
          "Gratis retour bij schade of verkeerde levering.",
        ],
      },
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

    function buildProfileDirectives(keyName) {
      const p = PROFILES[keyName] || PROFILES.default;
      return [
        `Profiel: ${p.display}`,
        `Toon-hints: ${p.toneHints.join(", ")}`,
        `Stijl: ${p.styleRules.join(", ")}`,
        `Terminologie — verkies: ${p.lexicon.prefer.join(", ")}; vermijd: ${p.lexicon.avoid.join(", ")}`,
        `Kennis (alleen indien relevant, kort):`,
        ...p.knowledge.map((k) => `- ${k}`),
      ].join("\n");
    }

    const finalSystem = [
      systemDirectives,
      buildProfileDirectives(profileKey),
    ].join("\n\n");

    // User prompt met type/tone (zoals je had)
    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    // ────────────────────────────────────────────────────────────────────────────
    // V1 PAYLOAD – LET OP camelCase: systemInstruction, generationConfig
    // ────────────────────────────────────────────────────────────────────────────
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
  system_instruction: { role: "system", parts: [{ text: finalSystem }] },
  contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  generationConfig: {
    temperature,
    topP: 0.95,
    topK: 50,
    maxOutputTokens: 512,
  },
}),
      }),
      20000
    );

    // Foutpad (toon upstream mee voor debug)
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: "Gemini error",
          upstreamStatus: resp.status,
          details: errText,
          meta: { source: "error" },
        }),
        { status: resp.status, headers: JSON_HEADERS }
      );
    }

    // Succes: parse & extraheer eerste candidate
    const data = await resp.json().catch(() => ({}));
    const rawText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Er is geen tekst gegenereerd.";

    // Post-processing: onderwerpregel weg
    const text = stripSubjectLine(rawText);

    return new Response(
      JSON.stringify({
        text,
        meta: {
          source: "model",
          temperature,
          topP: 0.95,
          topK: 50,
          profileKey,
          model: MODEL,
        },
      }),
      { headers: JSON_HEADERS }
    );
  } catch (e) {
    if (e && e.message === "Timeout") {
      return new Response(
        JSON.stringify({
          error: "Timeout",
          hint:
            "De AI deed er te lang over. Probeer het zo nog eens of versmal je vraag.",
          meta: { source: "timeout" },
        }),
        { status: 408, headers: JSON_HEADERS }
      );
    }
    return new Response(
      JSON.stringify({
        error: e?.message || "Unknown error",
        meta: { source: "exception" },
      }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
};
