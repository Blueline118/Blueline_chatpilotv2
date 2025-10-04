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
    const body = payload || {};

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

    const kbForPrompt = (Array.isArray(kb) ? kb : [])
      .sort((a, b) => (b?.rank ?? 0) - (a?.rank ?? 0))
      .slice(0, 2)
      .map((x) => ({ ...x, snippet: String(x?.snippet || "").slice(0, 200) }));

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
    const profile = buildProfileDirectives(profileKey);
    const sectionHeader = `Je bent de klantenservice-assistent.\nSchrijf in het Nederlands en klink vriendelijk-professioneel (menselijk, empathisch, behulpzaam).`;
    const sectionChannel = `\n\n${channelLine(type)}`;
    const sectionStyle = profile
      ? `\n\n${profile}`
      : `\n\nStijl: korte zinnen; geen jargon; positief geformuleerd\nVermijd: ticket, case, RMA`;
    const sectionRules = `\n\nRegels:\n• Gebruik alléén de KB hieronder als bron.\n• Feiten letterlijk overnemen (cijfers/eenheden exact).\n• Als KB leeg is: veilig, kort antwoord zonder cijfers; verwijs naar website/klantenservice.\n• Social: max 4 zinnen, 1 emoji. E-mail: 2–3 korte alinea’s.\n• Geen herhaling. Geen aannames. Zeg het als info ontbreekt.`;
    const sectionKb = Array.isArray(kbForPrompt) && kbForPrompt.length
      ? `\n\nKB\n` +
        kbForPrompt
          .map((x) => {
            const title = (x?.title ?? "").toString();
            const snippet = (x?.snippet ?? "").toString();
            if (!title && !snippet) return "";
            const prefix = title ? `• ${title}:` : "•";
            return `${prefix} ${snippet}`.trim();
          })
          .filter(Boolean)
          .join("\n")
      : "";
    const sectionQuestion = `\n\nVraag:\n\n${userText || ""}`;
    const fullPrompt =
      sectionHeader +
      sectionChannel +
      sectionStyle +
      sectionRules +
      sectionKb +
      sectionQuestion;

    // simpele tokenschatter (~4 chars per token)
    const est = (s) => Math.ceil(((s || "").length) / 4);
    const debugSections = {
      chars: {
        header: sectionHeader.length,
        channel: sectionChannel.length,
        style: sectionStyle.length,
        rules: sectionRules.length,
        kb: sectionKb.length,
        question: sectionQuestion.length,
        total: fullPrompt.length,
      },
      estTokens: {
        header: est(sectionHeader),
        channel: est(sectionChannel),
        style: est(sectionStyle),
        rules: est(sectionRules),
        kb: est(sectionKb),
        question: est(sectionQuestion),
        total: est(fullPrompt),
      },
    };
    const kbPromptLen = sectionKb.length;
    const kbLen = Array.isArray(kbForPrompt) ? kbForPrompt.length : 0;

    const contents = [{ role: "user", parts: [{ text: fullPrompt }] }];
    const isSocial = typeof type === "string" && /social/i.test(type);
    const generationConfig = {
      temperature: 0.6,
      topP: 0.95,
      topK: 50,
      maxOutputTokens: 2048,
    };
    const promptLen = fullPrompt.length;
    const systemLen = sectionHeader.length;
    const profileLen = sectionStyle.length;

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
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limited by Gemini (free tier)",
            meta: { source: "error", modelUsed: MODEL, code: 429 },
          }),
          { status: 429, headers: JSON_HEADERS }
        );
      }
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
    const usedKbTitles = (kbForPrompt || []).map((x) => x.title);
    const baseDebug = { ...dbg, kbLen };

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
          promptPreview: fullPrompt.slice(0, 600),
          promptLengths: {
            total: promptLen,
            system: systemLen,
            profile: profileLen,
            kb: kbPromptLen,
            user: (userText || "").length,
          },
          usedKb: usedKbTitles,
          channelDetected: isSocial ? "social" : "email",
          typeReceived: body.type || null,
        },
        debug: baseDebug,
      };

      // Extra’s alleen bij ?debug=1
      if (DEBUG) {
        payload.debug = {
          ...baseDebug,
          generationConfig,
          contentsSent: contents,
          upstream: data,
          fullPrompt,
          sectionLengths: debugSections.chars,
          sectionTokensApprox: debugSections.estTokens,
        };
      }

      return new Response(JSON.stringify(payload), { status: 502, headers: JSON_HEADERS });
    }

    const modelText = stripSubjectLine(firstText);
    const finalText = isSocial ? stripSocialToTwoSentences(modelText) : modelText;
    const baseMeta = {
      source: "model",
      build: BUILD_MARK,
      modelUsed: MODEL,
      temperature: generationConfig.temperature,
      topP: generationConfig.topP,
      topK: generationConfig.topK,
      usedKb: usedKbTitles,
      channelDetected: isSocial ? "social" : "email",
      typeReceived: body.type || null,
    };
    const respPayload = {
      text: finalText,
      meta: baseMeta,
      debug: baseDebug,
    };

    respPayload.meta.usedKb = usedKbTitles;

    if (DEBUG) {
      respPayload.debug = {
        ...baseDebug,
        promptLen,
        systemLen,
        profileLen,
        kbLen,
        kbPromptLen,
        promptPreview: fullPrompt.slice(0, 1200),
        generationConfig,
        contentsSent: contents,
        finishReason,
        blockReason,
        safetyRatings,
        fullPrompt,
        sectionLengths: debugSections.chars,
        sectionTokensApprox: debugSections.estTokens,
      };
    }

    return new Response(JSON.stringify(respPayload), { headers: JSON_HEADERS });

  } catch (e) {
    if (e?.status === 429) {
      return new Response(
        JSON.stringify({
          error: "Rate limited by Gemini (free tier)",
          meta: { source: "error", modelUsed: MODEL, code: 429 },
        }),
        { status: 429, headers: JSON_HEADERS }
      );
    }
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
