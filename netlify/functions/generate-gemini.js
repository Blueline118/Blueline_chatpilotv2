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

/** Compact de KB-context naar max N regels */
function formatKbContext(kbItems, maxItems = 3, maxCharsPerSnippet = 300) {
  if (!Array.isArray(kbItems) || kbItems.length === 0) return "";
  const top = kbItems
    .slice(0, maxItems)
    .map((it, idx) => {
      const title = (it.title || "").toString().trim();
      const snippet = ((it.snippet || it.body || "") + "").slice(0, maxCharsPerSnippet).trim();
      return `${idx + 1}) ${title ? `${title} — ` : ""}${snippet}`;
    })
    .join("\n");
  return `Context (max ${Math.min(maxItems, kbItems.length)}):\n${top}`;
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
Je bent de klantenservice-assistent van **Blueline Customer Care** (e-commerce/fashion).
Schrijf in het **Nederlands** en klink **vriendelijk-professioneel** (menselijk, empathisch, behulpzaam).

Algemene richtlijnen:
- **Social Media**: 1–2 zinnen, varieer formuleringen, maximaal 1 passende emoji.
- **E-mail**: 2–3 korte alinea’s (±80–140 woorden). **Schrijf GEEN onderwerpregel** en **geen regel die begint met "Onderwerp:" of "Subject:"**.
- Erken de situatie van de klant en geef, waar mogelijk, direct antwoord. Geen meta-uitleg.

Vraag- & gegevenslogica:
- **Beschikbaarheid / productinfo**: geef direct info of stel gerichte vragen (bijv. gewenste **maat/kleur/model**). **Vraag GEEN ordernummer.**
- **Leverstatus / vertraagd / niet ontvangen**: vraag **ordernummer + postcode + huisnummer** (alleen indien nodig).
- **Schade / defect**: vraag **foto + ordernummer** (alleen indien nodig).
- **Retour/ruil**: licht kort de procedure toe; vraag pas om gegevens als het echt nodig is.

Stijl:
- Varieer natuurlijk in aanhef en afsluiting; vermijd herhaalde standaardzinnen.
- Reageer alsof je al in een DM zit (dus niet “stuur ons een DM”).
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
    const kbBlock = formatKbContext(kb, 3, 350);

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
            temperature,
            topP: 0.95,
            topK: 50,
            maxOutputTokens: 512,
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

const rawText = extractTextFromCandidates(data);

// blok-/eindredenen tonen als er geen tekst komt
const blockReason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || null;
const safety = data?.candidates?.[0]?.safetyRatings || null;

const finalText = stripSubjectLine(
  rawText && rawText.trim().length > 0
    ? rawText
    : (blockReason
        ? `Ik kan niet antwoorden vanwege een blokkade (${blockReason}). Probeer je vraag anders te formuleren.`
        : "Er is geen tekst gegenereerd.")
);

const responsePayload = {
  text: finalText,
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

if (DEBUG) {
  responsePayload.debug = {
    blockReason,
    safetyRatings: safety,
    upstream: data,
  };
}

return new Response(JSON.stringify(responsePayload), { headers: JSON_HEADERS });

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
