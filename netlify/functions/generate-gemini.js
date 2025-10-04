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
  const filtered = lines.filter((line) =>
    !/^\s*(onderwerp|subject)\s*[:–—-]/i.test(line.replace(/\u00A0/g, " "))
  );
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripSocialToTwoSentences(input) {
  if (!input || typeof input !== "string") return input;

  // Max 1 emoji: verwijder extra's
  const emojiRegex = /([\p{Emoji_Presentation}\p{Emoji}\uFE0F])/gu;
  let emojiCount = 0;
  const noExtraEmojis = input.replace(emojiRegex, (m) => {
    emojiCount += 1;
    return emojiCount <= 1 ? m : "";
  });

  // Pak max 4 zinnen op basis van punt/uitroepteken/vraagteken
  const parts = noExtraEmojis
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const four = parts.slice(0, 4).join(" ");

  // Hard cap als extra veiligheidsnet
  return four.length > 280 ? four.slice(0, 277).trim() + "…" : four;
}

/** Compacte KB-sectie met beperkte bullets */
function formatKbSection(kbItems) {
  if (!Array.isArray(kbItems) || kbItems.length === 0) return "";

  const MAX_TOTAL = 400;
  const MAX_LINES = 3;
  const lines = [];
  let used = 0;

  for (const item of kbItems) {
    if (lines.length >= MAX_LINES) break;
    const title = (item?.title || "").toString().trim();
    const snippet = ((item?.snippet || item?.body || "") + "").trim();
    if (!snippet) continue;

    let bullet = title ? `• ${title}: ${snippet}` : `• ${snippet}`;
    if (bullet.length > 260) bullet = bullet.slice(0, 257).trimEnd() + "…";

    if (lines.length > 0 && used + bullet.length > MAX_TOTAL) break;
    lines.push(bullet);
    used += bullet.length;
  }

  return lines.length ? `KB\n${lines.join("\n")}` : "";
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
    const dbg = { notes: [] };
    const addDbg = (k, v) => {
      dbg[k] = v;
    };
    const note = (m) => {
      dbg.notes.push(m);
    };
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

    const { userText, type, tone, profileKey = "default" } = payload || {};

    const hasUrl = !!process.env.SUPABASE_URL;
    const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const hasSrv = !!srvKey;
    const srvKeyTail = srvKey ? srvKey.slice(-4) : "";
    addDbg("envHasSupabaseUrl", hasUrl);
    addDbg("envHasServiceRoleKey", hasSrv);
    addDbg("envServiceKeyTail", srvKeyTail);

    if (!userText || !type || !tone) {
      return new Response(JSON.stringify({ error: "Missing fields (userText, type, tone)" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const orgId = payload?.orgId || "54ec8e89-d265-474d-98fc-d2ba579ac83f";
    const qText = (payload?.userText || "").slice(0, 80);
    addDbg("orgIdUsed", orgId);
    addDbg("userTextPreview", qText);

    let kb = Array.isArray(payload?.kb) ? payload.kb : [];
    addDbg("clientKbLen", Array.isArray(kb) ? kb.length : -1);

    if (!kb || kb.length === 0) {
      note("serverKB: fallback path");
      try {
        const { default: supabaseServer } = await import("./supabaseServer.js");
        addDbg("serverRpcArgs", { p_org: orgId, q: qText, k: 5 });
        const { data: rows, error } = await supabaseServer.rpc("kb_search_chunks", {
          p_org: orgId,
          q: userText,
          k: 5,
        });

        if (error) {
          addDbg("serverKbError", error.message || String(error));
          console.error("SERVER_KB_ERROR", error.message || error);
        }
        const mapped = (rows || []).map((r) => ({
          id: r.id,
          title: r.title,
          snippet: r.snippet,
          rank: r.rank,
        }));
        addDbg("serverKbCount", mapped.length);
        kb = mapped;
      } catch (e) {
        addDbg("serverKbCatch", e?.message || String(e));
      }
    } else {
      note("serverKB: client kb used");
    }

    // Temperatuur
    const envTemp = process?.env?.GEMINI_TEMPERATURE ? clampTemp(process.env.GEMINI_TEMPERATURE) : null;
    const temperature = envTemp ?? 0.7;

    function channelLine(type) {
      const t = (type || "").toLowerCase();
      if (t.includes("social")) {
        return "Social: max 4 zinnen (≤400 tekens). Geen aanhef of afsluiting. Max 1 emoji.";
      }
      if (t.includes("mail") || t.includes("e-mail") || t.includes("email")) {
        return "E-mail: antwoord in 2–3 korte alinea’s; geen onderwerpregel.";
      }
      return "E-mail: antwoord in 2–3 korte alinea’s; geen onderwerpregel.";
    }

    // Prompt samenstellen zonder systemInstruction veld (v1 compat)
    const system = baseSystemDirectives();
    const profile = buildProfileDirectives(profileKey);
    const rulesSection = [
      "Regels:",
      "• Gebruik uitsluitend de meegegeven kennisbank-snippets als primaire bron. Als KB niet leeg is: beantwoord met die inhoud.",
      "• Neem feiten (bedragen, aantallen, datums, termijnen, namen) letterlijk over uit de KB. Verander geen cijfers/eenheden.",
      "• Als KB leeg is: geef een kort, veilig antwoord zonder specifieke cijfers/voorwaarden en adviseer waar nodig vervolg (link/klantenservice).",
      "• Respecteer kanaalregels: Social = max 2 zinnen (~220 tekens), E-mail = 2–3 korte alinea’s.",
      "• Wees beknopt, geen herhaling, geen ‘hallucinaties’. Zeg expliciet dat info ontbreekt als het niet in KB staat.",
    ].join("\n");
    const kbBlock = formatKbSection(kb);
    const kbPromptLen = (kbBlock || "").length;
    const kbLen = Array.isArray(kb) ? kb.length : 0;

    const userPrompt = [
      system,
      channelLine(type),
      profile,
      rulesSection,
      kbBlock || null,
      "Vraag:",
      userText,
    ]
      .filter(Boolean)
      .join("\n\n");

// Voor debug: korte prompt-preview (ook bij 502)

const promptPreview = userPrompt.slice(0, 600);


    const contents = [{ role: "user", parts: [{ text: userPrompt }] }];
    const generationConfig = {
  temperature,
  topP: 0.95,
  topK: 50,
  // meer budget zodat er na "thoughts" ook tekst overblijft:
  maxOutputTokens: 2048,
};
    const promptLen = userPrompt.length;
    const systemLen = system.length;
    const profileLen = profile.length;

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
            kb: kbPromptLen,
            user: (userText || "").length,
          },
          usedKb: Array.isArray(kb) ? kb.map(({ title }) => title) : [],
        },
      };

      // Extra’s alleen bij ?debug=1
      if (DEBUG) {
        payload.debug = {
          generationConfig,
          contentsSent: contents,
          upstream: data,
          kbLen,
        };
        payload.debug = {
          ...payload.debug,
          ...dbg,
        };
      }

      return new Response(JSON.stringify(payload), { status: 502, headers: JSON_HEADERS });
    }

    // ---- Numeric fact lock (post-check) ----
function extractFacts(text) {
  if (typeof text !== "string") return [];
  const facts = [];
  // zoek combinaties "24 maanden", "30 dagen", etc.
  const re = /\b(\d+)\s*(dagen?|maanden?)\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    facts.push({ n: m[1], unit: m[2].toLowerCase(), raw: m[0] });
  }
  return facts;
}

const kbText = (Array.isArray(kb) ? kb.map(x => x.snippet).join(" ") : "") || "";
const kbFacts = extractFacts(kbText);
const ansFacts = extractFacts(modelText);

// Als KB feiten heeft, maar antwoord geen enkel exact KB-getal bevat → minimale correctie
if (kbFacts.length && !ansFacts.some(af => kbFacts.some(kf => af.n === kf.n && af.unit === kf.unit))) {
  // Kies het eerste KB-feit als “belangrijkste”
  const main = kbFacts[0];
  modelText = `${modelText} ${main.n} ${main.unit} volgens de kennisbank.`;
}

    const modelText = stripSubjectLine(firstText);
    // Als het kanaal "social" is: maximaal 4 zinnen, max 1 emoji
    const isSocial = typeof type === "string" && /social/i.test(type);
    const finalText = isSocial ? stripSocialToTwoSentences(modelText) : modelText;

    const respPayload = {
      text: finalText,
      meta: {
        source: "model",
        build: BUILD_MARK,
        modelUsed: MODEL,
        temperature,
        topP: 0.95,
        topK: 50,
        usedKb: Array.isArray(kb) ? kb.map(({ title }) => title) : [],
      },
    };

    respPayload.meta.usedKb = (kb || []).map((x) => x.title);
    if (DEBUG) {
      addDbg("kbLen", (kb || []).length);
    }

    if (DEBUG) {
      respPayload.debug = {
        promptLen,
        systemLen,
        profileLen,
        kbLen,
        kbPromptLen,
        promptPreview: userPrompt.slice(0, 1200),
        generationConfig,
        contentsSent: contents,
        finishReason,
        blockReason,
        safetyRatings,
        ...dbg,
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
