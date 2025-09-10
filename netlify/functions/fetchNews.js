// netlify/functions/fetchNews.js
// Node 18+ (Netlify Functions)
// - Haalt whitelisted RSS/Atom feeds op in parallel
// - Parse -> normaliseer -> dedupe -> sorteer -> truncate
// - In-memory caching (15 min) + HTTP cache headers
// - Timeouts en nette foutafhandeling

const FEEDS = [
  {
    source: "Emerce",
    source_url: "https://www.emerce.nl/",
    url: "https://www.emerce.nl/nieuws/feed",
    host: "www.emerce.nl",
  },
  {
    source: "CustomerThink",
    source_url: "https://customerthink.com/",
    url: "https://customerthink.com/feed/",
    host: "customerthink.com",
  },
  // Uitbreidbaar: voeg hier feeds toe
];

const TTL_MS = 12 * 60 * 60 * 1000; // 12 uur
let CACHE = { at: 0, items: [] };

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const MAX_SERVER_ITEMS = 12;
const FEED_TIMEOUT_MS = 6000;

// Eenvoudige permissieve XML parser zonder externe dependency (basic RSS/Atom)
function parseXml(xml) {
  // RSS 2.0
  let channelMatch = xml.match(/<channel[\s\S]*?<\/channel>/i);
  if (channelMatch) {
    const channel = channelMatch[0];
    const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
    return items.map((raw) => {
      const title = untag(raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
      const link = untag(raw.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
      const guid = untag(raw.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] || "").trim();
      const pub = untag(raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
      return { title, link: link || guid, date: pub };
    });
  }

  // Atom
  let feedMatch = xml.match(/<feed[\s\S]*?<\/feed>/i);
  if (feedMatch) {
    const feed = feedMatch[0];
    const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
    return entries.map((raw) => {
      const title = untag(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
      const linkTag = raw.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i);
      const link = linkTag ? linkTag[1] : "";
      const updated = untag(raw.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] || "").trim();
      const published = untag(raw.match(/<published>([\s\S]*?)<\/published>/i)?.[1] || "").trim();
      return { title, link, date: updated || published };
    });
  }

  return [];
}

function untag(s) {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").replace(/<[^>]+>/g, "");
}

function tryParseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function domainOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

// Deduplicate op url+title (case-insensitive)
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = (it.url || "").toLowerCase() + "||" + (it.title || "").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function fetchWithTimeout(url, ms) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "ChatpilotNewsBot/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

export default async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(request),
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Use GET" }), {
        status: 405,
        headers: JSON_HEADERS,
      });
    }

    // Cache check
    const now = Date.now();
    const reqUrl = new URL(request.url);

    // Eén keer parsen en hergebruiken; geen her-declaratie
    const limitParam = Math.min(
      Math.max(Number(reqUrl.searchParams.get("limit")) || 4, 1),
      Math.min(8, MAX_SERVER_ITEMS)
    );

    const useCache = CACHE.items.length && now - CACHE.at < TTL_MS;
    if (useCache) {
      return new Response(JSON.stringify({ items: CACHE.items.slice(0, limitParam) }), {
        status: 200,
        headers: {
          ...JSON_HEADERS,
          ...corsHeaders(request),
          "Cache-Control": "public, max-age=300, s-maxage=900",
        },
      });
    }

    // Feeds ophalen (parallel)
    const results = await Promise.allSettled(
      FEEDS.map(async (f) => {
        // Whitelist guard
        if (domainOf(f.url) !== f.host) throw new Error("Host mismatch");
        const xml = await fetchWithTimeout(f.url, FEED_TIMEOUT_MS);
        const parsed = parseXml(xml);
        // Normaliseren
        return parsed.map((p) => {
          const iso = tryParseDate(p.date)?.toISOString() || null;
          return {
            source: f.source,
            source_url: f.source_url,
            title: p.title || "",
            url: p.link || "",
            published_at: iso,
            iso_date: iso,
          };
        });
      })
    );

    let items = [];
    let anyOk = false;

    for (const r of results) {
      if (r.status === "fulfilled") {
        anyOk = true;
        items.push(...r.value.filter((x) => x.title && x.url));
      }
    }

    if (!anyOk) {
      return new Response(JSON.stringify({ error: "All feeds failed" }), {
        status: 502,
        headers: { ...JSON_HEADERS, ...corsHeaders(request) },
      });
    }

    // Dedup + sort (nieuwste eerst)
    items = dedupe(items).sort((a, b) => {
      const ta = a.iso_date ? Date.parse(a.iso_date) : 0;
      const tb = b.iso_date ? Date.parse(b.iso_date) : 0;
      return tb - ta;
    });

    // Max 1 item per bron; daarna aanvullen tot 'limitParam'
    function pickDistinctBySource(arr, max) {
      const seen = new Set();
      const out = [];
      for (const it of arr) {
        const key = (it.source || "").toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
        if (out.length >= max) break;
      }
      return out;
    }

    const distinctFirst = pickDistinctBySource(items, limitParam);

    const usedUrls = new Set(distinctFirst.map((i) => i.url));
    const filled = [...distinctFirst];
    for (const it of items) {
      if (filled.length >= limitParam) break;
      if (usedUrls.has(it.url)) continue;
      filled.push(it);
      usedUrls.add(it.url);
    }

    // Cache volledige lijst (handig voor volgende requests)
    CACHE = { at: Date.now(), items };

    return new Response(JSON.stringify({ items: filled }), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        ...corsHeaders(request),
        "Cache-Control": "public, max-age=300, s-maxage=900",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...JSON_HEADERS, ...corsHeaders(request) },
    });
  }
};
