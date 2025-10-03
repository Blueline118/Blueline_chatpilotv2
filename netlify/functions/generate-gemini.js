// netlify/functions/generate-gemini.js
// ============================================================================
// Blueline Chatpilot – Gemini gateway (REST v1)
// - Automatische model-fallback op basis van ListModels (v1)
// - System prompt als prefix in user prompt (geen system_instruction veld nodig)
// - Response bevat meta.modelUsed zodat je ziet welk model live draait
// ============================================================================

const API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1";
/** Let op: hier ZONDER "models/" prefix; de URL voegt /models/ zelf toe. */
const ENV_MODEL = (process.env.GEMINI_MODEL || "").replace(/^models\//, "").trim();
/** Kandidaten voor gratis/snel → betaald/beter volgorde */
const CANDIDATE_MODELS = [
  ENV_MODEL || null,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-2.5-pro" // als je quota hebt
].filter(Boolean);

const JSON_HEADERS = { "Content-Type": "application/json" };
const BUILD_MARK = "v1-fallback-model-prefix-systemprompt@2025-10-03";

/** In-memory cache van models lijst (per function cold start) */
let _modelsCache = { at: 0, names: [] };

function withTimeout(promise, ms = 20000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms)),
  ]);
}

function stripSubjectLine(s) {
  if (typeof s !== "string") return s;
  const lines = s.split(/\r?\n/);
  const filtered = lines.filter(
    (line) => !/^\s*(onderwerp|subject)\s*[:–—-]/i.test(line.replace(/\u00A0/g, " "))
  );
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Haal lijst met models op (v1) en cache 5 min */
async function listModels(key) {
  const now = Date.now();
  if (_modelsCache.names.length && now - _modelsCache.at < 5 * 60 * 1000) {
    return _modelsCache.names;
  }
  const url = `${API_BASE}/models?key=${encodeURIComponent(key)}`;
  const resp = await withTimeout(fetch(url), 10000);
  if (!resp.ok) {
    // geef lege lijst terug; caller zal trial/fallback doen
    return [];
  }
  const data = await resp.json().catch(() => ({}));
  const names = Array.isArray(data?.models)
    ? data.models.map((m) => String(m?.name || "")).filter(Boolean) // bv. "models/gemini-2.0-flash"
    : [];
  _modelsCache = { at: now, names };
  return names;
}

/** Controleer of een model naam (zonder "models/") in ListModels zit en generateContent kan */
function modelSupported(modelName, list) {
  const full = `models/${modelName}`;
  return list.some((n) => n === full);
}

/** Roep generateContent aan met fallback over CANDIDATE_MODELS */
async function callGeminiWithFallback({ key, body }) {
  // stap 1: kijk of ENV/candidates in ListModels staan; zo ja → probeer in volgorde
  let names = [];
  try {
    names = await listModels(key);
  } catch {
    names = []; // als list faalt, blijven we trialen op HTTP
  }

  let last404 = null;

  for (const m of CANDIDATE_MODELS) {
    // Als we een geldige lijst hebben, sla modellen over die niet voorkomen
    if (names.length && !modelSupported(m, names)) {
      continue;
    }

    const url = `${API_BASE}/models/${m}:generateContent?key=${encodeURIComponent(key)}`;
    const resp = await fetch(url, { method: "POST", headers: JSON_HEADERS, body });

    if (resp.ok) {
      return { resp, modelUsed: m };
    }

    const text = await resp.text().catch(() => "");
    if (resp.status === 404) {
      last404 = { status: 404, text, model: m };
      continue; // probeer volgende kandidaat
    }
    // andere fout → direct terug
    return { resp, text, modelUsed: m };
  }

  // niets gewerkt
  return {
    resp: { ok: false, status: last404?.status || 404 },
    text: last404?.text || "",
    modelUsed: CANDIDATE_MODELS.at(-1),
  };
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("ping")) {
      return new Response(
        JSON.stringify({
          ok: true,
          pong: true,
          build: BUILD_MARK,
          env_model: ENV_MODEL || null,
          candidates: CANDIDATE_MODELS,
          api_base: API_BASE,
        }),
        { headers: JSON_HEADERS }
      );
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

    const { userText, type, tone, profileKey = "default" } = payload || {};
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

    const temperature = 0.7;

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

    const finalSystem = [systemDirectives, buildProfileDirectives(profileKey)].join("\n\n");

    // System prompt als prefix in dezelfde user prompt (schema-proof)
    const userPrompt = `${finalSystem}

---
Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
        topP: 0.95,
        topK: 50,
        maxOutputTokens: 512,
      },
    });

    const { resp, text: errPayload, modelUsed } = await withTimeout(
      callGeminiWithFallback({ key, body }),
      20000
    );

    if (!resp.ok) {
      const errText = errPayload || (await resp.text().catch(() => ""));
      return new Response(
        JSON.stringify({
          error: "Gemini error",
          upstreamStatus: resp.status,
          details: errText,
          meta: { source: "error", build: BUILD_MARK, modelTried: modelUsed, api_base: API_BASE },
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
        meta: {
          source: "model",
          build: BUILD_MARK,
          modelUsed,
          temperature,
          topP: 0.95,
          topK: 50,
        },
      }),
      { headers: JSON_HEADERS }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e?.message || "Unknown error",
        meta: { source: e?.message === "Timeout" ? "timeout" : "exception", build: BUILD_MARK },
      }),
      { status: e?.message === "Timeout" ? 408 : 500, headers: JSON_HEADERS }
    );
  }
};
