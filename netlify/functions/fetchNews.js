// netlify/functions/fetchNews.js
// Node 18+
// Doel:
// - Verzamel uit 8–10 whitelisted RSS/Atom feeds
// - Sorteer op publicatiedatum (nieuwste eerst)
// - Stel batches samen van 5 artikelen met unieke bron (fallback: vul aan met andere artikelen zonder herhaling)
// - Cache batch 24 uur; ververs automatisch daarna
// - Geen herhaling van exact hetzelfde artikel in opeenvolgende batches

const FEEDS = [
  { source: "Emerce", source_url: "https://www.emerce.nl/", url: "https://www.emerce.nl/nieuws/feed", host: "www.emerce.nl" },
  { source: "Frankwatching", source_url: "https://www.frankwatching.com/", url: "https://www.frankwatching.com/feed/", host: "www.frankwatching.com" },
  { source: "CustomerFirst", source_url: "https://www.customerfirst.nl", url: "https://www.customerfirst.nl/rss", host: "www.customerfirst.nl" },
  { source: "Webwinkel Vakdagen", source_url: "https://www.webwinkelvakdagen.nl/blog", url: "https://www.webwinkelvakdagen.nl/blog", host: "www.webwinkelvakdagen.nl" },
  { source: "Twinkle Magazine", source_url: "https://twinklemagazine.nl/", url: "https://twinklemagazine.nl/rss", host: "twinklemagazine.nl" },
  { source: "Adformatie Digital", source_url: "https://www.adformatie.nl/digital", url: "https://www.adformatie.nl/rss.xml", host: "www.adformatie.nl" },
  { source: "Marketingfacts", source_url: "https://www.marketingfacts.nl/", url: "https://www.marketingfacts.nl/feed", host: "www.marketingfacts.nl" },
  { source: "Dutchcowboys E-commerce", source_url: "https://www.dutchcowboys.nl/ecommerce", url: "https://feeds.feedburner.com/dutchcowboys/ecommerce", host: "feeds.feedburner.com" },
  { source: "RetailTrends", source_url: "https://retailtrends.nl/", url: "https://retailtrends.nl/rss", host: "retailtrends.nl" },
  { source: "Klantenservice Federatie (KSF)", source_url: "https://klantenservicefederatie.nl/actueel/", url: "https://klantenservicefederatie.nl/feed/", host: "klantenservicefederatie.nl" },
];

const BATCH_SIZE = 5;
const FEED_TIMEOUT_MS = 8000;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

// Cache: 24u batch-cache + (optioneel) 15 min feedlist cache om netwerk te sparen
const BATCH_TTL_MS = 24 * 60 * 60 * 1000; // 24 uur
const LIST_TTL_MS = 15 * 60 * 1000; // 15 minuten
let LIST_CACHE = { at: 0, items: [] }; // alle genormaliseerde items, gesorteerd
let BATCH_CACHE = { at: 0, items: [], prevUrls: new Set() }; // laatste batch + set URLs voor anti-herhaling

// ===== Utils =====
function corsHeaders(request) {
  const origin = request.headers.get("origin") || "*";
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

function domainOf(url) { try { return new URL(url).host; } catch { return ""; } }
function untag(s = "") { return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").replace(/<[^>]+>/g, ""); }
function tryParseDate(s) { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; }

// Deduplicate op url+title (case-insensitive)
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = (it.url || "").toLowerCase() + "||" + (it.title || "").toLowerCase();
    if (seen.has(k)) continue; seen.add(k); out.push(it);
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
  } finally { clearTimeout(id); }
}

// Eenvoudige permissieve XML parser (RSS 2.0 / Atom)
function parseXml(xml) {
  // RSS 2.0
  const channel = xml.match(/<channel[\s\S]*?<\/channel>/i)?.[0];
  if (channel) {
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
  const feed = xml.match(/<feed[\s\S]*?<\/feed>/i)?.[0];
  if (feed) {
    const entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
    return entries.map((raw) => {
      const title = untag(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
      const linkTag = raw.match(/<link[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/i);
      const link = linkTag ? linkTag[1] : "";
      const updated = untag(raw.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] || "").trim();
      const published = untag(raw.match(/<published>([\s\S]*?)<\/published>/i)?.[1] || "").trim();
      return { title, link, date: updated || published };
    });
  }
  return [];
}

// ===== Kern: lijst ophalen + sorteren =====
async function getSortedItemList() {
  const now = Date.now();
  if (LIST_CACHE.items.length && now - LIST_CACHE.at < LIST_TTL_MS) return LIST_CACHE.items;

  const results = await Promise.allSettled(
    FEEDS.map(async (f) => {
      if (domainOf(f.url) !== f.host) throw new Error("Host mismatch");
      const xml = await fetchWithTimeout(f.url, FEED_TIMEOUT_MS);
      const parsed = parseXml(xml);
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
  for (const r of results) if (r.status === "fulfilled") items.push(...r.value.filter((x) => x.title && x.url));
  items = dedupe(items).sort((a, b) => (Date.parse(b.iso_date || 0) - Date.parse(a.iso_date || 0)));

  LIST_CACHE = { at: now, items };
  return items;
}

// Stel batch samen: 5 unieke bronnen, fallback naar andere artikelen, geen herhaling uit vorige batch
function buildBatch(sortedItems, prevUrlSet, size = BATCH_SIZE) {
  const out = [];
  const usedSources = new Set();

  // 1) Eerst unieke bronnen pakken (nieuwste eerst), overslaan als in prev batch
  for (const it of sortedItems) {
    if (out.length >= size) break;
    if (prevUrlSet?.has(it.url)) continue; // geen herhaling
    const sKey = (it.source || "").toLowerCase();
    if (usedSources.has(sKey)) continue;
    usedSources.add(sKey);
    out.push(it);
  }

  // 2) Als minder dan size, vul aan (zonder url-herhaling), desnoods met zelfde bron
  if (out.length < size) {
    const usedUrls = new Set(out.map((i) => i.url));
    for (const it of sortedItems) {
      if (out.length >= size) break;
      if (prevUrlSet?.has(it.url) || usedUrls.has(it.url)) continue;
      out.push(it);
      usedUrls.add(it.url);
    }
  }

  return out.slice(0, size);
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
      return new Response(JSON.stringify({ error: "Use GET" }), { status: 405, headers: JSON_HEADERS });
    }

    const now = Date.now();
    const url = new URL(request.url);

    // Force refresh? `?refresh=1` om batch te verversen buiten TTL
    const forceRefresh = url.searchParams.get("refresh") === "1";

    // 24u batch cache
    if (!forceRefresh && BATCH_CACHE.items.length && now - BATCH_CACHE.at < BATCH_TTL_MS) {
      return new Response(
        JSON.stringify({ batch: { at: new Date(BATCH_CACHE.at).toISOString(), expires_at: new Date(BATCH_CACHE.at + BATCH_TTL_MS).toISOString() }, items: BATCH_CACHE.items }),
        { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request), "Cache-Control": "public, max-age=300, s-maxage=900" } }
      );
    }

    // Nieuwe lijst en batch samenstellen
    const sorted = await getSortedItemList();
    const prevSet = BATCH_CACHE.prevUrls instanceof Set ? BATCH_CACHE.prevUrls : new Set();
    const items = buildBatch(sorted, prevSet, BATCH_SIZE);

    // Update batch-cache + prev-set voor anti-herhaling in volgende batch
    BATCH_CACHE = {
      at: now,
      items,
      prevUrls: new Set(items.map((i) => i.url)),
    };

    return new Response(
      JSON.stringify({ batch: { at: new Date(now).toISOString(), expires_at: new Date(now + BATCH_TTL_MS).toISOString() }, items }),
      { status: 200, headers: { ...JSON_HEADERS, ...corsHeaders(request), "Cache-Control": "public, max-age=300, s-maxage=900" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
