"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, type SearchRow, type ResultRow } from "../../../../lib/api";

function numPrice(r: any) {
  const n1 = Number(r?.price_num);
  if (Number.isFinite(n1) && n1 > 0) return n1;

  const n2 = Number(r?.price);
  if (Number.isFinite(n2) && n2 > 0) return n2;

  return null;
}

function isRecent(iso?: string | null, hours = 48) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const age = Date.now() - t;
  return age >= 0 && age <= hours * 60 * 60 * 1000;
}

function resultKey(r: any): string {
  return String(
    r?.id ??
    r?.external_id ??
    r?.listing_url ??
    `${r?.marketplace ?? "m"}:${r?.title ?? "t"}`,
  );
}

function fmtPrice(price: any, currency?: string | null) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString();
}

function pillClass(kind: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  return `pill ${kind}`;
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [rows, setRows] = useState<ResultRow[]>([]);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");

  const searchParams = useSearchParams();
  const focusNew = (searchParams.get("focus") || "").toLowerCase() === "new";

  const backendBase = (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  ).replace(/\/+$/, "");

  const storageKey = `gosnaggit:hiddenResults:${id}`;
  const [hiddenKeys, setHiddenKeys] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const count = rows?.length ?? 0;

  // Load hidden keys
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(arr)) setHiddenKeys(arr.map(String));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist hidden keys
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(hiddenKeys));
    } catch {
      // ignore
    }
  }, [storageKey, hiddenKeys]);

  // Auth status
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        setLoggedIn(Boolean((data as any)?.loggedIn));
      } catch {
        if (!alive) return;
        setLoggedIn(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function hideResult(k: string) {
    setHiddenKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
  }

  function undoHide() {
    setHiddenKeys([]);
  }

  // Fetch results (with polling)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const [s, r0] = await Promise.all([api.getSearch(id), api.getResults(id, 200, 0)]);
        if (!alive) return;

        setSearch(s || null);

        let r = r0;
        if ((!r || r.length === 0) && alive) {
          const attempts = 10;
          const delayMs = 2000;

          for (let i = 0; i < attempts && alive; i++) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const rNext = await api.getResults(id, 200, 0);
            if (!alive) return;

            r = rNext;
            if (r && r.length > 0) break;
          }
        }

        if (!alive) return;
        setRows(r || []);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  // Sort results
  const sorted = useMemo(() => {
    const base = (rows || []).slice();

    base.sort((a: any, b: any) => {
      const aNew = isRecent(a?.found_at || a?.created_at, 48);
      const bNew = isRecent(b?.found_at || b?.created_at, 48);
      if (focusNew && aNew !== bNew) return aNew ? -1 : 1;

      if (sortBy === "newest") {
        const at = Date.parse(a?.found_at || a?.created_at || "") || 0;
        const bt = Date.parse(b?.found_at || b?.created_at || "") || 0;
        return bt - at;
      }

      const ap = numPrice(a) ?? Number.POSITIVE_INFINITY;
      const bp = numPrice(b) ?? Number.POSITIVE_INFINITY;
      if (sortBy === "price_low") return ap - bp;
      return bp - ap;
    });

    return base;
  }, [rows, sortBy, focusNew]);

  // Price stats (from rows)
  const priceStats = useMemo(() => {
    const nums = (rows || [])
      .map((r: any) => numPrice(r))
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    if (!nums.length) return null;

    const min = nums[0];
    const max = nums[nums.length - 1];
    const median = nums[Math.floor(nums.length / 2)];

    const maxPrice =
      (search as any)?.max_price != null && Number((search as any).max_price) > 0
        ? Number((search as any).max_price)
        : null;

    const underMax = maxPrice != null ? nums.filter((n) => n <= maxPrice).length : 0;

    return { min, max, median, maxPrice, underMax };
  }, [rows, search]);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Results for #{id}</h1>
          <p className="muted">
            Latest stored results from the backend{" "}
            {loading ? "" : `• ${count} item${count === 1 ? "" : "s"}`}
            {focusNew ? " • showing NEW first" : ""}
          </p>
        </div>

        <div className="ctaRow">
          <a
            className="btn"
            href={
              loggedIn
                ? `/saved-searches/${id}`
                : `/signup?next=${encodeURIComponent(`/saved-searches/${id}`)}`
            }
          >
            Details
          </a>
          <a
            className="btn"
            href={
              loggedIn
                ? `/saved-searches/${id}/alerts`
                : `/signup?next=${encodeURIComponent(`/saved-searches/${id}/alerts`)}`
            }
          >
            Alerts
          </a>
        </div>
      </div>

      {hiddenKeys.length ? (
        <div className="flash warn" style={{ marginBottom: 12 }}>
          You hid {hiddenKeys.length} result{hiddenKeys.length === 1 ? "" : "s"}.
          <button className="btn" style={{ marginLeft: 10 }} type="button" onClick={undoHide}>
            Undo
          </button>
        </div>
      ) : null}

      {priceStats ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="resultMeta" style={{ marginBottom: 6 }}>
            <div>
              <strong>Price stats:</strong> min {fmtPrice(priceStats.min)} • median{" "}
              {fmtPrice(priceStats.median)} • max {fmtPrice(priceStats.max)}
            </div>
            <div className="muted">
              {priceStats.maxPrice != null
                ? `Under max (${priceStats.maxPrice}): ${priceStats.underMax}`
                : ""}
            </div>
          </div>

          <div className="ctaRow">
            <button
              className={`btn ${sortBy === "newest" ? "primary" : ""}`}
              onClick={() => setSortBy("newest")}
              type="button"
            >
              Newest
            </button>
            <button
              className={`btn ${sortBy === "price_low" ? "primary" : ""}`}
              onClick={() => setSortBy("price_low")}
              type="button"
            >
              Price ↑
            </button>
            <button
              className={`btn ${sortBy === "price_high" ? "primary" : ""}`}
              onClick={() => setSortBy("price_high")}
              type="button"
            >
              Price ↓
            </button>
          </div>
        </div>
      ) : null}

      {err ? <div className="flash bad">{err}</div> : null}

      {loading ? (
        <div className="card">Loading…</div>
      ) : count === 0 ? (
        <div className="card empty">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>No results yet</div>
          <div className="muted" style={{ marginBottom: 12 }}>
            Once your search runs, results will appear here. You can also trigger a refresh from Alerts.
          </div>
          <div className="ctaRow">
            <a
              className="btn primary"
              href={
                loggedIn
                  ? `/saved-searches/${id}/alerts`
                  : `/signup?next=${encodeURIComponent(`/saved-searches/${id}/alerts`)}`
              }
            >
              Go to Alerts
            </a>
            <a
              className="btn"
              href={
                loggedIn
                  ? `/saved-searches/${id}`
                  : `/signup?next=${encodeURIComponent(`/saved-searches/${id}`)}`
              }
            >
              Back to Details
            </a>
          </div>
        </div>
      ) : (
        <div className="resultsGrid">
          {sorted.map((r: any) => {
            const key = resultKey(r);
            if (hiddenKeys.includes(key)) return null;

            const isNew = isRecent(r?.found_at || r?.created_at, 48);
            const mp = String(r?.marketplace || "").toLowerCase();
            const mpLabel = r?.marketplace ? String(r.marketplace).toUpperCase() : "SOURCE";

            const priceLabel = fmtPrice(r?.price_num ?? r?.price, r?.currency);
            const p = numPrice(r);
            const isBest = priceStats && p != null && p === priceStats.min;
            const underMax =
              priceStats && p != null && priceStats.maxPrice != null && p <= priceStats.maxPrice;

            const when = fmtWhen(r?.found_at || r?.created_at);
            const hasImg = Boolean(r?.image_url);
            const listingUrl = String(r?.listing_url || "");

            const destUrl =
              listingUrl && listingUrl.includes("ebay.")
                ? listingUrl +
                (listingUrl.includes("?") ? "&" : "?") +
                "campid=" +
                String(process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID || "") +
                "&customid=search-" +
                String(params.id)
                : listingUrl;

            const trackUrl =
              backendBase && destUrl
                ? `${backendBase}/api/click?url=${encodeURIComponent(destUrl)}` +
                `&search_id=${encodeURIComponent(String(params.id))}` +
                `&result_id=${encodeURIComponent(String(r?.id ?? ""))}` +
                `&marketplace=${encodeURIComponent(String(r?.marketplace ?? ""))}` +
                `&customid=${encodeURIComponent("search-" + String(params.id))}`
                : destUrl;

            return (
              <div className={`resultCard ${isNew ? "newCard" : ""}`} key={key}>
                <div className="resultMedia">
                  {hasImg ? (
                    <img
                      src={String(r.image_url)}
                      alt={String(r?.title || "Result image")}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="resultMediaFallback">
                      <span>no image</span>
                    </div>
                  )}
                </div>

                <div className="resultBody">
                  <div className="resultTop">
                    <span className={pillClass(mp === "ebay" ? "ok" : "neutral")}>{mpLabel}</span>
                    {isNew ? (
                      <span className="pill bad pillNew" title="New result">
                        NEW
                      </span>
                    ) : null}
                    {isBest ? <span className={`${pillClass("ok")} pillBest`}>🏷️ BEST PRICE</span> : null}
                    {underMax ? (
                      <span className={`${pillClass("warn")} pillUnder`}>UNDER MAX</span>
                    ) : null}
                    {r?.condition ? <span className={pillClass("neutral")}>{String(r.condition)}</span> : null}
                    {r?.location ? <span className={pillClass("neutral")}>{String(r.location)}</span> : null}
                  </div>

                  <div className="resultTitle">{String(r?.title || "Untitled listing")}</div>

                  <div className="resultMeta">
                    <div className="resultPrice">{priceLabel}</div>
                    <div className="muted">{when}</div>
                  </div>

                  <div className="resultActions">
                    {listingUrl ? (
                      <a className="btn primary" href={trackUrl} target="_blank" rel="noreferrer">
                        Open listing
                      </a>
                    ) : null}
                    <button className="btn danger" type="button" onClick={() => hideResult(key)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .page { padding: 18px; }
        .pageHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
        .h1 { margin: 0 0 6px 0; font-size: 22px; }
        .muted { opacity: 0.8; }
        .ctaRow { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }
        .resultsGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .resultCard { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.25); }
        .newCard { outline: 2px solid rgba(255,220,80,0.3); }
        .resultMedia { width: 120px; height: 120px; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; }
        .resultMedia img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .resultMediaFallback { font-size: 12px; opacity: 0.7; }
        .resultBody { display: flex; flex-direction: column; gap: 8px; }
        .resultTop { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .resultTitle { font-weight: 800; line-height: 1.2; }
        .resultMeta { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
        .resultPrice { font-weight: 900; }
        .resultActions { display: flex; gap: 8px; flex-wrap: wrap; }
      `}</style>
    </main>
  );
}