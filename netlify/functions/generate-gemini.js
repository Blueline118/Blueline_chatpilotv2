// netlify/functions/generate-gemini.js

// ────────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────────
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1";
const API_URL = `${API_BASE}/models/${MODEL}:generateContent`;

const BUILD_MARK = `kb-chat@${new Date().toISOString()}`;

// ────────────────────────────────────────────────────────────────────────────────
function withTimeout(promise, ms = 20000) {
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

/** Verwijder "Onderwerp:" / "Subject:" regels (en varianten) uit tekst */
function stripSubjectLine(s) {
  if (typeof s !== "string") return s;
  const lines = s.split(/\r?\n/);
  const filtered = lines.filter((line) => !/^\s*(onderwerp|subject)\s*[:–—-]/i.test(line.replace(/\u00A0/g, " ")));
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Compact de KB-context naar totaalbudget (chars) */
// Compact KB: at most ~400 characters total, max 2 lines
function formatKbContextBudgeted(kbItems) {
  if (!Array.isArray(kbItems) || kbItems.length === 0) return "";
  const MAX_TOTAL = 400;
  const lines = [];
  let used = 0;

  for (const it of kbItems.slice(0, 3)) {
    const title = (it?.title || "").toString().trim();
    const snip  = ((it?.snippet || it?.body || "") + "").trim();
    if (!snip) continue;

    let line = title ? `• ${title}: ${snip}` : `• ${snip}`;
    if (line.length > 240) line = line.slice(0, 240) + "…";

    if (used + line.length > MAX_TOTAL) break;
    lines.push(line);
    used += line.length;
    if (lines.length >= 2) break; // max 2 bullets
  }

  return lines.length
    ? `Feiten (kort):\n${lines.join("\n")}`
    : "";
}


/** Bouw profielrichtlijnen (lichte hints) */
function buildProfileDirectives(profileKey) {
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
      toneHints: ["inspirerend", "respectvol", "vertrouwelijk"],
      styleRules: ["verfijnde toon", "korte zinnen", "inclusief taalgebruik"],
      lexicon: { prefer: ["collectie", "maat", "retourneren"], avoid: ["RMA", "order-ID"] },
      knowledge: [
        "Wereldwijde verzending 2–5 dagen.",
        "Retour binnen 14 dagen.",
        "Focus op stijl, comfort, bescheiden elegantie.",
      ],
    },
  };
  const p = PROFILES[profileKey] || PROFILES.default;
  return [
    `Profiel: ${p.display}`,
    `Toon-hints: ${p.toneHints.join(", ")}`,
    `Stijl: ${p.styleRules.join(", ")}`,
    `Terminologie — verkies: ${p.lexicon.prefer.join(", ")}; vermijd: ${p.lexicon.avoid.join(", ")}`,
    `Kennis (alleen indien relevant, kort):`,
    ...p.knowledge.map((k) => `- ${k}`),
  ].join("\n");
}

/** Basissysteemrichtlijnen – compacte versie */
function baseSystemDirectives() {
  return [
    "Jij bent klantenservice-assistent voor Blueline Customer Care (e-commerce).",
    "Schrijf in het Nederlands; toon: vriendelijk, professioneel, empathisch.",
    "Social: 1–2 zinnen, max 1 emoji. E-mail: 80–140 woorden, géén onderwerpregel.",
    "Geef direct antwoord; stel alleen noodzakelijke vervolgvragen.",
    "Alleen indien nodig: (levering) ordernr+postcode+huisnr • (schade) foto+ordernr • (retour/ruil) korte procedure."
  ].join("\n");
}

export default async (request) => {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("ping")) {
      return new Response(JSON.stringify({ ok: true, pong: true, build: BUILD_MARK }), {
        headers: JSON_HEADERS,
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    // Payload lezen
    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const {
      userText,
      type,
      tone,
      profileKey = "default",
      kb = [], // optioneel: array [{id,title,snippet,rank}]
    } = payload || {};

    if (!userText || !type || !tone) {
      return new Response(JSON.stringify({ error: "Missing fields (userText, type, tone)" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Temperatuur
    const envTemp = process?.env?.GEMINI_TEMPERATURE ? clampTemp(process.env.GEMINI_TEMPERATURE) : null;
    const temperature = envTemp ?? 0.7;

     // Compacte prompt – kort & schaalbaar
const system = "Je bent een NL klantenservice-assistent. Antwoord kort, concreet en behulpzaam.";
const profile = ""; // voorlopig geen lange profielregels, scheelt tokens
const kbBlock = formatKbContextBudgeted(kb);

const userPrompt = [
  system,
  kbBlock, // compact KB-feiten
  `Stijl: ${tone || "Professioneel"}`,
  "Beantwoord in maximaal 120 woorden.",
  `Vraag: ${userText}`
].filter(Boolean).join("\n");

    // API-call
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
  temperature: 0.4,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 256
}

        }),
      }),
      20000
    );

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({
          error: "Gemini error",
          upstreamStatus: resp.status,
          details: errText,
          meta: { source: "error", build: BUILD_MARK, modelUsed: MODEL },
        }),
        { status: resp.status, headers: JSON_HEADERS }
      );
    }

    const data = await resp.json().catch(() => ({}));

// optionele debug: ?debug=1
const DEBUG = new URL(request.url).searchParams.get("debug") === "1";

// Parse candidate + redenen
const cand          = data?.candidates?.[0] ?? null;
const parts         = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
const firstText     = parts.find((p) => typeof p?.text === "string")?.text ?? "";
const finishReason  = cand?.finishReason ?? cand?.finish_reason ?? null;
const blockReason   = data?.promptFeedback?.blockReason ?? null;
const safetyRatings = cand?.safetyRatings ?? null;

// Geen bruikbaar modelantwoord → expliciet 502
if (!firstText || firstText.trim() === "") {
  const respPayload = {
    error: "Empty model response",
    meta: {
      source: "empty",
      build: BUILD_MARK,
      modelUsed: MODEL,
      finishReason,
      blockReason,
      safetyRatings,
      usedKb: Array.isArray(kb)
        ? kb.slice(0, 3).map(({ id, title }) => ({ id, title }))
        : [],
    },
    ...(DEBUG ? { upstream: data, parts } : {}),
  };
  return new Response(JSON.stringify(respPayload), { status: 502, headers: JSON_HEADERS });
}

// Normaal pad
const modelText = stripSubjectLine(firstText);

const respPayload = {
  modelText,
  meta: {
    source: "model",
    build: BUILD_MARK,
    modelUsed: MODEL,
    temperature,
    topP: 0.95,
    topK: 50,
    usedKb: Array.isArray(kb)
      ? kb.slice(0, 3).map(({ id, title }) => ({ id, title }))
      : [],
  },
  ...(DEBUG ? { upstream: data } : {}),
};

return new Response(JSON.stringify(respPayload), { headers: JSON_HEADERS });


// Normal success path
const text = stripSubjectLine(firstText);

const out = {
  text,
  meta: {
    source: "model",
    build: BUILD_MARK,
    modelUsed: MODEL,
    temperature,
    topP: 0.95,
    topK: 50,
    usedKb: Array.isArray(kb)
      ? kb.slice(0, 3).map(({ id, title }) => ({ id, title }))
      : [],
  },
};
if (DEBUG) payload.debug = { finishReason, blockReason, safetyRatings };

return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });


  } catch (e) {
    const isTimeout = e?.message === "Timeout";
    return new Response(
      JSON.stringify({
        error: isTimeout ? "Timeout" : e?.message || "Unknown error",
        meta: { source: isTimeout ? "timeout" : "exception", build: BUILD_MARK, modelUsed: MODEL },
      }),
      { status: isTimeout ? 408 : 500, headers: JSON_HEADERS }
    );
  }
};
