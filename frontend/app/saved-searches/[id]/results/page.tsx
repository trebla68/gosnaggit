"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type SearchRow } from "../../../../lib/api";

type ResultRow = {
  id?: string | number;
  search_id?: string | number;
  marketplace?: string | null;
  external_id?: string | null;

  title?: string | null;
  price?: string | number | null;
  currency?: string | null;

  listing_url?: string | null;
  image_url?: string | null;

  location?: string | null;
  condition?: string | null;
  seller_username?: string | null;

  found_at?: string | null;
  created_at?: string | null;

  // Neon numeric column (you added)
  price_num?: number | null;
};

function fmtPrice(price: any, currency?: string | null) {
  if (price === null || price === undefined || price === "") return "—";
  const n = Number(price);
  if (Number.isFinite(n)) {
    try {
      if (currency) {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(n);
      }
    } catch { }
    return n.toFixed(2);
  }
  return String(price);
}

function numPrice(r: any) {
  // Prefer indexed numeric column
  const n1 = Number(r?.price_num);
  if (Number.isFinite(n1) && n1 > 0) return n1;

  // Fallback legacy
  const n2 = Number(r?.price);
  if (Number.isFinite(n2) && n2 > 0) return n2;

  return null;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function pillClass(kind: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  return `pill pill-${kind}`;
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [rows, setRows] = useState<ResultRow[]>([]);
  const [search, setSearch] = useState<SearchRow | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const count = rows?.length ?? 0;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [s, data] = await Promise.all([
          api.getSearch(id),
          api.getResults(id, 200, 0),
        ]);

        if (!alive) return;
        setSearch(s);
        setRows(Array.isArray(data) ? (data as ResultRow[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load results");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const sorted = useMemo(() => {
    const copy = [...rows];

    if (sortBy === "price_low") {
      return copy.sort((a, b) => (numPrice(a) ?? Infinity) - (numPrice(b) ?? Infinity));
    }

    if (sortBy === "price_high") {
      return copy.sort((a, b) => (numPrice(b) ?? -Infinity) - (numPrice(a) ?? -Infinity));
    }

    // Default: newest first
    return copy.sort((a, b) => {
      const ta = new Date(a.found_at || a.created_at || 0).getTime();
      const tb = new Date(b.found_at || b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [rows, sortBy]);

  const priceStats = useMemo(() => {
    const nums = (sorted || [])
      .map((r) => numPrice(r))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    if (nums.length === 0) return null;

    const min = nums[0];
    const max = nums[nums.length - 1];
    const mid = Math.floor(nums.length / 2);
    const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;

    const maxPrice = search?.max_price ?? null;
    const underMax = maxPrice == null ? null : nums.filter((n) => n <= maxPrice).length;

    return { min, median, max, count: nums.length, maxPrice, underMax };
  }, [sorted, search]);

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Results for #{id}</h1>
          <p className="muted">
            Latest stored results from the backend{" "}
            {loading ? "" : `• ${count} item${count === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}`}>Details</a>
          <a className="btn" href={`/saved-searches/${id}/alerts`}>Alerts</a>
        </div>
      </div>

      {priceStats ? (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="pill pill-neutral">Lowest: {fmtPrice(priceStats.min, "USD")}</span>
            <span className="pill pill-neutral">Median: {fmtPrice(priceStats.median, "USD")}</span>
            <span className="pill pill-neutral">Highest: {fmtPrice(priceStats.max, "USD")}</span>

            {priceStats.maxPrice != null ? (
              <span className="pill pill-ok">
                Under your max ({priceStats.maxPrice}): {priceStats.underMax ?? 0}/{priceStats.count}
              </span>
            ) : (
              <span className="pill pill-warn">No max price set for this search</span>
            )}
          </div>
        </div>
      ) : null}

      <div className="card">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : err ? (
          <div className="empty">Error: {err}</div>
        ) : sorted.length === 0 ? (
          <div className="empty">No results yet.</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 800 }}>{sorted.length} results</div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="muted">Sort</span>
                <select
                  className="input"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                >
                  <option value="newest">Newest</option>
                  <option value="price_low">Price: Low → High</option>
                  <option value="price_high">Price: High → Low</option>
                </select>
              </label>
            </div>

            <div className="resultsGrid">
              {sorted.map((r, idx) => {
                const key = (r.id ?? r.external_id ?? idx) as any;
                const mp = (r.marketplace || "").toLowerCase();
                const mpLabel = r.marketplace ? r.marketplace.toUpperCase() : "SOURCE";
                const priceLabel = fmtPrice(r.price_num ?? r.price, r.currency);
                const p = numPrice(r);

                const isBest = priceStats && p != null && p === priceStats.min;
                const underMax =
                  priceStats && p != null && priceStats.maxPrice != null && p <= priceStats.maxPrice;

                const when = fmtWhen(r.found_at || r.created_at);
                const hasImg = !!r.image_url;

                return (
                  <div className="resultCard" key={key}>
                    <div className="resultMedia">
                      {hasImg ? (
                        <img
                          src={r.image_url as string}
                          alt={r.title || "Result image"}
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
                        {isBest ? <span className={pillClass("ok")}>BEST PRICE</span> : null}
                        {underMax ? <span className={pillClass("warn")}>UNDER MAX</span> : null}
                        {r.condition ? <span className={pillClass("neutral")}>{r.condition}</span> : null}
                        {r.location ? <span className={pillClass("neutral")}>{r.location}</span> : null}
                      </div>

                      <div className="resultTitle">{r.title || "Untitled listing"}</div>

                      <div className="resultMeta">
                        <div className="resultPrice">{priceLabel}</div>
                        <div className="muted">{when}</div>
                      </div>

                      <div className="resultActions">
                        {r.listing_url ? (
                          <a className="btn primary" href={r.listing_url as string} target="_blank" rel="noreferrer">
                            Open listing
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          padding: 18px;
        }
        .pageHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
        }
        .muted {
          opacity: 0.72;
          margin: 6px 0 0;
        }
        .ctaRow {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .card {
          padding: 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.12);
        }
        .empty {
          padding: 18px;
          opacity: 0.8;
        }
        .resultsGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .resultCard {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.10);
          display: grid;
          grid-template-rows: 160px auto;
        }
        .resultMedia {
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .resultMedia img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .resultMediaFallback {
          opacity: 0.7;
          font-size: 12px;
        }
        .resultBody {
          padding: 12px;
          display: grid;
          gap: 8px;
        }
        .resultTop {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .resultTitle {
          font-weight: 800;
          line-height: 1.2;
        }
        .resultMeta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
        }
        .resultPrice {
          font-weight: 900;
        }
        .resultActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.06);
        }
        .pill-neutral {
          background: rgba(255, 255, 255, 0.06);
        }
        .pill-ok {
          background: rgba(46, 204, 113, 0.18);
          border-color: rgba(46, 204, 113, 0.45);
        }
        .pill-warn {
          background: rgba(255, 179, 71, 0.18);
          border-color: rgba(255, 179, 71, 0.45);
        }
        .pill-bad {
          background: rgba(231, 76, 60, 0.18);
          border-color: rgba(231, 76, 60, 0.45);
        }
      `}</style>
    </main>
  );
}
