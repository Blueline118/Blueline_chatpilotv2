// src/components/SidebarNewsFeed.jsx
import React, { useEffect, useState } from "react";

const cx = (...a) => a.filter(Boolean).join(" ");

function formatDateNL(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

function SkeletonItem() {
  return (
    <div className="rounded-lg p-3 bg-white/60 border border-gray-200 animate-pulse">
      <div className="h-3.5 w-3/4 rounded bg-gray-200" />
      <div className="h-3 w-1/3 rounded bg-gray-200 mt-2" />
    </div>
  );
}

export default function SidebarNewsFeed() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/.netlify/functions/fetchNews");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!alive) return;
        setItems(Array.isArray(data.items) ? data.items.slice(0, 4) : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Kon de nieuwsfeed niet laden.");
        setItems([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (items === null) {
    return (
      <div className="space-y-2">
        <SkeletonItem /><SkeletonItem /><SkeletonItem /><SkeletonItem />
      </div>
    );
  }

  if (err) {
    return <div className="text-xs text-gray-500">Kon de nieuwsfeed niet laden.</div>;
  }

  if (!items.length) {
    return <div className="text-xs text-gray-500">Geen recente artikelen.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <a
          key={idx}
          href={it.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            "block rounded-lg border border-gray-200 bg-white p-3",
            "hover:bg-gray-50 transition-colors"
          )}
        >
          <div className="text-sm font-medium text-[#194297] line-clamp-2">{it.title}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              {it.source}
            </span>
            <span className="text-[11px] text-gray-500">{formatDateNL(it.iso_date || it.published_at)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
