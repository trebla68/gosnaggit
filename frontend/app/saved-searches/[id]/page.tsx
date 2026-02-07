"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type AlertSummary, type SearchRow } from "../../../lib/api";
import Link from "next/link";

function num(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSummary(s: any): AlertSummary {
  // Handles different possible backend shapes safely
  return {
    pending: num(s?.pending ?? s?.pending_count ?? 0),
    sent: num(s?.sent ?? s?.sent_count ?? 0),
    dismissed: num(s?.dismissed ?? s?.dismissed_count ?? 0),
    error: num(s?.error ?? s?.error_count ?? 0),
  } as AlertSummary;
}

function pill(status?: string | null) {
  const v = (status || "").toLowerCase();
  if (v === "active") return "pill ok";
  if (v === "paused") return "pill warn";
  if (v === "deleted" || v === "cancelled") return "pill bad";
  return "pill neutral";
}

type MkKey = "ebay" | "etsy" | "facebook" | "craigslist";
type MkMap = Record<MkKey, boolean>;

function normalizeMk(input: any): MkMap {
  const src = (input && typeof input === "object") ? input : {};
  return {
    ebay: !!src.ebay,
    etsy: !!src.etsy,
    facebook: !!src.facebook,
    craigslist: !!src.craigslist,
  };
}

export default function SearchDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);

  const [search, setSearch] = useState<SearchRow | null>(null);
  const [summary, setSummary] = useState<AlertSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Alert settings
  const [alertEnabled, setAlertEnabled] = useState<boolean>(true);
  const [alertMode, setAlertMode] = useState<"immediate" | "daily">("immediate");
  const [maxPerEmail, setMaxPerEmail] = useState<number>(25);
  const [alertLoading, setAlertLoading] = useState<boolean>(true);
  const [alertSaving, setAlertSaving] = useState<boolean>(false);

  // Email notification (destination + enabled)
  const [emailEnabled, setEmailEnabled] = useState<boolean>(false);
  const [emailDestination, setEmailDestination] = useState<string>("");
  const [emailSaving, setEmailSaving] = useState<boolean>(false);

  // Marketplaces for this search
  const [marketplaces, setMarketplaces] = useState<MkMap>({ ebay: true, etsy: false, facebook: false, craigslist: false });
  const [mkSaving, setMkSaving] = useState<boolean>(false);

  const hasEmail = useMemo(() => !!emailDestination.trim(), [emailDestination]);

  function setMk(key: MkKey, next: boolean) {
    setMarketplaces((prev) => ({ ...prev, [key]: next }));
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const s = await api.getSearch(id);
      setSearch(s);

      // marketplaces may be null in older rows — default to ebay on
      const mk = normalizeMk((s as any)?.marketplaces);
      if (!mk.ebay && !mk.facebook && !mk.craigslist && !mk.etsy) mk.ebay = true;
      setMarketplaces(mk);

      const sumRaw = await api.getAlertSummary(id);
      setSummary(normalizeSummary(sumRaw));
    } catch (e: any) {
      setErr(e?.message || "Failed to load search");
    } finally {
      setLoading(false);
    }
  }

  async function loadAlertSettings() {
    setAlertLoading(true);
    try {
      const res = await api.getAlertSettings(id);
      const settings = res?.settings || { enabled: true, mode: "immediate", maxPerEmail: 25 };
      setAlertEnabled(!!settings.enabled);
      setAlertMode(settings.mode === "daily" ? "daily" : "immediate");
      setMaxPerEmail(Number(settings.maxPerEmail) || 25);
    } catch {
      // assume enabled (legacy default)
      setAlertEnabled(true);
      setAlertMode("immediate");
      setMaxPerEmail(25);
    } finally {
      setAlertLoading(false);
    }
  }

  async function loadNotificationStatus() {
    try {
      const res = await api.getNotificationStatus(id);
      setEmailEnabled(!!res?.email_enabled);
      setEmailDestination(res?.email_destination || "");
    } catch {
      setEmailEnabled(false);
      setEmailDestination("");
    }
  }

  async function saveAlertSettings() {
    setAlertSaving(true);
    try {
      await api.saveAlertSettings(id, {
        enabled: alertEnabled,
        mode: alertMode,
        maxPerEmail: Math.max(1, Number(maxPerEmail) || 25),
      });
    } catch (e: any) {
      alert(e?.message || "Failed to save alert settings");
    } finally {
      setAlertSaving(false);
    }
  }

  async function saveEmail() {
    if (!emailDestination.trim()) {
      alert("Please enter an email address.");
      return;
    }
    setEmailSaving(true);
    try {
      await api.saveEmailNotification(id, { email: emailDestination.trim(), enabled: emailEnabled });
    } catch (e: any) {
      alert(e?.message || "Failed to save email notification");
    } finally {
      setEmailSaving(false);
    }
  }

  async function saveMarketplaces() {
    setMkSaving(true);
    try {
      await api.patchSearch(id, { marketplaces: { ...marketplaces, etsy: false } });
      // refresh the search row so the page stays truthful
      const s = await api.getSearch(id);
      setSearch(s);
    } catch (e: any) {
      alert(e?.message || "Failed to save marketplaces");
    } finally {
      setMkSaving(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) return;
    load();
    loadAlertSettings();
    loadNotificationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <main className="page"><p className="muted">Loading…</p></main>;
  if (err) return <main className="page"><p className="pill bad">{err}</p></main>;
  if (!search) return <main className="page"><p className="muted">Not found.</p></main>;

  return (
    <main className="page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 6 }}>{search.search_item}</h1>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className={pill(search.status)}>{(search.status || "—").toUpperCase()}</span>
            {search.location ? <span className="pill neutral">{search.location}</span> : null}
            {search.category ? <span className="pill neutral">{search.category}</span> : null}
            {search.max_price != null ? <span className="pill neutral">Max ${search.max_price}</span> : null}
          </div>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <Link className="btn" href={`/saved-searches/${id}/results`}>View results</Link>
          <Link className="btn" href={`/saved-searches/${id}/alerts`}>Manage alerts</Link>
          <Link className="btn" href={`/saved-searches/${id}/edit`}>Edit</Link>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Alert summary</div>
            <div className="muted" style={{ marginTop: 4 }}>Counts for this search.</div>
          </div>
          {summary ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="pill neutral">Pending {summary.pending}</span>
              <span className="pill neutral">Sent {summary.sent}</span>
              <span className="pill neutral">Dismissed {summary.dismissed}</span>
              <span className="pill neutral">Error {summary.error}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="panel">
          <div style={{ fontWeight: 900, fontSize: 14 }}>Alert settings</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Control whether alerts send, how often, and how many per email.
          </div>

          <div style={{ marginTop: 12 }}>
            <label className="row" style={{ gap: 10 }}>
              <input
                type="checkbox"
                checked={alertEnabled}
                disabled={alertLoading}
                onChange={(e) => setAlertEnabled(e.target.checked)}
              />
              <span>{alertEnabled ? "Alerts enabled" : "Alerts disabled"}</span>
            </label>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>Email</label>
            <input
              value={emailDestination}
              onChange={(e) => setEmailDestination(e.target.value)}
              placeholder="you@example.com"
            />

            <label className="row" style={{ gap: 10, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                disabled={!hasEmail}
              />
              <span>{emailEnabled ? "Email notifications on" : "Email notifications off"}</span>
            </label>

            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <button className="btn" type="button" onClick={saveEmail} disabled={emailSaving || !hasEmail}>
                {emailSaving ? "Saving…" : "Save email"}
              </button>
              {!hasEmail ? <span className="muted">Enter an email to enable notifications.</span> : null}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label>Delivery</label>
            <select
              value={alertMode}
              onChange={(e) => setAlertMode(e.target.value === "daily" ? "daily" : "immediate")}
            >
              <option value="immediate">Immediate</option>
              <option value="daily">Daily digest</option>
            </select>
          </div>

          <div style={{ marginTop: 10 }}>
            <label>Max per email</label>
            <input
              value={String(maxPerEmail)}
              onChange={(e) => setMaxPerEmail(Number(e.target.value))}
              placeholder="25"
            />
          </div>

          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={saveAlertSettings} disabled={alertSaving}>
              {alertSaving ? "Saving…" : "Save alert settings"}
            </button>
            {!alertEnabled ? (
              <span className="muted">Alerts are off — “Send now” will be disabled on the alerts page.</span>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div style={{ fontWeight: 900, fontSize: 14 }}>Marketplaces</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Choose where this search runs. (Etsy is coming soon.)
          </div>

          <div style={{ marginTop: 10 }} className="grid2">
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={marketplaces.ebay} onChange={(e) => setMk("ebay", e.target.checked)} />
              <span>eBay</span>
            </label>

            <label className="row" style={{ gap: 8, opacity: 0.7 }}>
              <input type="checkbox" checked={marketplaces.etsy} disabled />
              <span>
                Etsy <span className="pill neutral" style={{ marginLeft: 6 }}>Coming soon</span>
              </span>
            </label>

            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={marketplaces.facebook}
                onChange={(e) => setMk("facebook", e.target.checked)}
              />
              <span>Facebook</span>
            </label>

            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={marketplaces.craigslist}
                onChange={(e) => setMk("craigslist", e.target.checked)}
              />
              <span>Craigslist</span>
            </label>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={saveMarketplaces} disabled={mkSaving}>
              {mkSaving ? "Saving…" : "Save marketplaces"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
