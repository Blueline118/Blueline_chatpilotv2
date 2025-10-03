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
function formatKbContextBudgeted(kbItems) {
  if (!Array.isArray(kbItems) || kbItems.length === 0) return "";
  const MAX_CONTEXT_BUDGET = 500; // was 800
  const MAX_ITEMS          = 2;   // was 3
  const TITLE_COST         = 40;

  let used = 0;
  const picked = [];

  for (const it of kbItems) {
    if (picked.length >= MAX_ITEMS) break;
    const title = (it.title || "").toString().trim();
    const raw   = ((it.snippet || it.body || "") + "").trim();
    const room  = Math.max(0, MAX_CONTEXT_BUDGET - used - (title ? TITLE_COST : 0));
    if (room <= 0) break;

    const text  = raw
      .replace(/[\s\r\n\t]+/g, " ")
      .slice(0, room)
      .trim();
    if (!text) continue;

    picked.push({ title, text });
    used += text.length + (title ? TITLE_COST : 0);
  }

  if (picked.length === 0) return "";

  const top = picked
    .map((it, idx) => `${idx + 1}) ${it.title ? `${it.title} — ` : ""}${it.text}`)
    .join("\n");

  return `Context (max ${picked.length}):\n${top}`;
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

/** Basissysteemrichtlijnen (geen systemInstruction veld gebruiken: merge in prompt) */
function baseSystemDirectives() {
  return `
Je bent een NL klantenservice-assistent (e-commerce/fashion).
Schrijf kort, vriendelijk en behulpzaam. 
Social: 1–2 zinnen (max 1 emoji). E-mail: 2–3 korte alinea’s (geen onderwerpregel).
Vraag alleen noodzakelijke gegevens.
`.trim();
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

    // Profiel & KB
    const profile = buildProfileDirectives(profileKey);
    const kbBlock = formatKbContextBudgeted(kb);

    // Prompt samenstellen zonder systemInstruction veld (v1 compat)
    const system = baseSystemDirectives();
    const userPrompt = [
      system,
      profile,
      kbBlock ? kbBlock : "",
      `Type: ${type}`,
      `Stijl: ${tone}`,
      "",
      "Invoer klant:",
      userText,
    ]
      .filter(Boolean)
      .join("\n\n");

    // API-call
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
  temperature,        // keep whatever you have
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 1024,   // was 768
  candidateCount: 1
},

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

// helper: probeer zoveel mogelijk tekst uit kandidaten te halen
function extractTextFromCandidates(d) {
  const c = d?.candidates?.[0];
  if (!c) return "";
  // 1) eerste text-part als die bestaat
  const p1 = c?.content?.parts?.find((p) => typeof p?.text === "string")?.text;
  if (p1) return p1;
  // 2) concateneer alle text-parts
  const all = (c?.content?.parts || [])
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return all;
}

// optionele debug: ?debug=1 aan de functie-URL toont upstream terug
const urlObj = new URL(request.url);
const DEBUG = urlObj.searchParams.get("debug") === "1";

// Parse candidate + reasons
const cand          = data?.candidates?.[0] ?? null;
const parts         = cand?.content?.parts ?? [];
const firstText     = parts.find((p) => typeof p?.text === "string")?.text ?? "";
const finishReason  = cand?.finishReason ?? cand?.finish_reason ?? null;
const blockReason   = data?.promptFeedback?.blockReason ?? null;
const safetyRatings = cand?.safetyRatings ?? data?.safetyRatings ?? null;

// If model returned no text → return explicit 502 with diagnostics
if (!firstText || firstText.trim() === "") {
  const payload = {
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
  };
  if (DEBUG) out.debug = { upstream: data, parts };
  return new Response(JSON.stringify(payload), { status: 502, headers: JSON_HEADERS });
}

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
