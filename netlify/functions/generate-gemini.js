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

/** Compacte profielrichtlijnen (alleen stijl en verboden termen) */
function buildProfileDirectives(profileKey) {
  const PROFILES = {
    default: {
      style: "korte zinnen; geen jargon; positief geformuleerd",
      avoid: ["ticket", "case", "RMA"],
    },
    merrachi: {
      style: "verfijnde toon; korte zinnen; inclusief taal",
      avoid: ["RMA", "order-ID"],
    },
  };
  const p = PROFILES[profileKey] || PROFILES.default;
  return [
    `Stijl: ${p.style}`,
    p.avoid?.length ? `Vermijd: ${p.avoid.join(", ")}` : null,
  ].filter(Boolean).join("\n");
}

/** Basissysteemrichtlijnen (ultra-compact) */
function baseSystemDirectives() {
  return [
    "Je bent de klantenservice-assistent.",
    "Schrijf in het Nederlands en klink vriendelijk-professioneel (menselijk, empathisch, behulpzaam)."
  ].join("\n");
}


export default async (request) => {
  try {
    const url = new URL(request.url);
    const DEBUG = url.searchParams.get("debug") === "1";
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

function channelLine(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("social")) return "Social: 1–2 zinnen; varieer; max 1 emoji.";
  if (t.includes("mail") || t.includes("e-mail") || t.includes("email")) {
    return "E-mail: 2–3 korte alinea’s (±80–140 woorden); geen onderwerpregel.";
  }
  // fallback (pas desgewenst aan)
  return "E-mail: 2–3 korte alinea’s (±80–140 woorden); geen onderwerpregel.";
}

   // Prompt samenstellen zonder systemInstruction veld (v1 compat)
const system  = baseSystemDirectives();
const profile = buildProfileDirectives(profileKey);
const kbBlock =
  typeof formatKbContextBudgeted === "function"
    ? formatKbContextBudgeted(kb)
    : (typeof formatKbContext === "function" ? formatKbContext(kb, 3, 280) : "");

const userPrompt = [
  system,               // kort systeemkader
  channelLine(type),    // **dynamische** kanaalregel o.b.v. UI-keuze
  profile,              // compact profiel (stijl/lexicon hints)
  kbBlock || null,      // compacte KB-context (optioneel)
  "Vraag:",
  userText
].filter(Boolean).join("\n\n");
// Voor debug: korte prompt-preview (ook bij 502)

const promptPreview = userPrompt.slice(0, 600);


    const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
    const generationConfig = {
  temperature,
  topP: 0.95,
  topK: 50,
  // meer budget zodat er na "thoughts" ook tekst overblijft:
  maxOutputTokens: 1024,
};
    const promptLen = userPrompt.length;
    const systemLen = system.length;
    const profileLen = profile.length;
    const kbLen = (kbBlock || "").length;

    const payloadForGemini = { contents, generationConfig };

    // API-call
    const resp = await withTimeout(
      fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(payloadForGemini),
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

    const cand = data?.candidates?.[0] ?? null;
    const parts = cand?.content?.parts ?? [];
    const firstText = parts.find((p) => typeof p?.text === "string")?.text ?? "";
    const finishReason = cand?.finishReason ?? cand?.finish_reason ?? null;
    const blockReason = data?.promptFeedback?.blockReason ?? null;
    const safetyRatings = cand?.safetyRatings ?? data?.safetyRatings ?? null;
    

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
      // ▶︎ altijd meegeven (niet alleen in DEBUG), zodat je het in UI/Network ziet
      promptPreview: userPrompt.slice(0, 600),
      promptLengths: {
        total: promptLen,
        system: systemLen,
        profile: profileLen,
        kb: kbLen,
        user: (userText || "").length,
      },
      usedKb: Array.isArray(kb)
        ? kb.slice(0, 3).map(({ id, title }) => ({ id, title }))
        : [],
    },
  };

  // Extra’s alleen bij ?debug=1
  if (DEBUG) {
    payload.debug = {
      generationConfig,
      contentsSent: contents,
      upstream: data,
    };
  }

  return new Response(JSON.stringify(payload), { status: 502, headers: JSON_HEADERS });
}


    const modelText = stripSubjectLine(firstText);
    const respPayload = {
      text: modelText,
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
      respPayload.debug = {
        promptLen,
        systemLen,
        profileLen,
        kbLen,
        promptPreview: userPrompt.slice(0, 1200),
        generationConfig,
        contentsSent: contents,
        finishReason,
        blockReason,
        safetyRatings,
      };
    }

    return new Response(JSON.stringify(respPayload), { headers: JSON_HEADERS });

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
