"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type SearchRow } from "../../../../lib/api";
import { useRouter } from "next/navigation";

type MpKey = "ebay" | "etsy" | "facebook" | "craigslist";

function asBool(x: any, fallback: boolean) {
  return typeof x === "boolean" ? x : fallback;
}

function normalizeMarketplaces(input: any): Record<MpKey, boolean> {
  const m = (input && typeof input === "object") ? input : {};
  return {
    ebay: asBool(m.ebay, true),
    etsy: asBool(m.etsy, true),
    facebook: asBool(m.facebook, false),
    craigslist: asBool(m.craigslist, false),
  };
}

export default function EditSearch({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const router = useRouter();

  const [s, setS] = useState<SearchRow | null>(null);

  // core fields
  const [item, setItem] = useState("");
  const [loc, setLoc] = useState("");
  const [cat, setCat] = useState("");
  const [max, setMax] = useState("");

  // marketplaces
  const [mps, setMps] = useState<Record<MpKey, boolean>>(normalizeMarketplaces(null));

  // alert settings (server-side file store)
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [alertMode, setAlertMode] = useState<"immediate" | "daily">("immediate");
  const [maxPerEmail, setMaxPerEmail] = useState(25);

  // email notifications (db)
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState("");

  // ui
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canSaveEmail = useMemo(() => {
    if (!emailEnabled) return true; // allowed if we keep an email value
    return !!email.trim();
  }, [emailEnabled, email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [search, notif, a] = await Promise.all([
          api.getSearch(id),
          api.getNotificationStatus(id).catch(() => null),
          api.getAlertSettings(id).catch(() => null),
        ]);
        if (!alive) return;

        setS(search);
        setItem(search.search_item || "");
        setLoc(search.location || "");
        setCat(search.category || "");
        setMax(search.max_price != null ? String(search.max_price) : "");

        setMps(normalizeMarketplaces((search as any).marketplaces));

        if (notif?.ok) {
          setEmailEnabled(!!notif.email_enabled);
          setEmail(notif.email_destination || "");
        }

        if (a?.ok && a.settings) {
          setAlertsEnabled(!!a.settings.enabled);
          setAlertMode(a.settings.mode === "daily" ? "daily" : "immediate");
          const mpe = Number(a.settings.maxPerEmail);
          setMaxPerEmail(Number.isFinite(mpe) && mpe > 0 ? Math.min(200, Math.max(1, Math.floor(mpe))) : 25);
        }
      } catch (e: any) {
        alert(e?.message || "Failed to load search");
      }
    })();
    return () => { alive = false; };
  }, [id]);

  function toggleMp(key: MpKey) {
    setMps((cur) => ({ ...cur, [key]: !cur[key] }));
  }

  async function onSave() {
    if (!item.trim()) { alert("Search item is required."); return; }

    // If user turns emailEnabled on, require an email string.
    if (emailEnabled && !email.trim()) {
      alert("Please enter an email address (or turn Email notifications off).");
      return;
    }

    try {
      setBusy(true);
      setToast("Saving…");

      const max_price = max.trim() ? Number(max) : null;

      // 1) save core search fields + marketplaces
      await api.patchSearch(id, {
        search_item: item.trim(),
        location: loc.trim() || null,
        category: cat.trim() || null,
        max_price: Number.isFinite(max_price as any) ? max_price : null,
        marketplaces: mps,
      });

      // 2) save alert settings (enabled/mode/maxPerEmail)
      await api.saveAlertSettings(id, {
        enabled: !!alertsEnabled,
        mode: alertMode,
        maxPerEmail: Math.min(200, Math.max(1, Math.floor(Number(maxPerEmail) || 25))),
      });

      // 3) save email notification destination (DB)
      // Backend requires a valid email even if disabled, so:
      // - if we have an email value (existing or typed), we can save enabled true/false
      // - if there is no email at all and it's disabled, we skip saving
      const emailTrim = email.trim();
      if (emailTrim) {
        await api.saveEmailNotification(id, { email: emailTrim, enabled: !!emailEnabled });
      }

      setToast("Saved ✅");
      setTimeout(() => setToast(null), 1500);
      router.push(`/saved-searches/${id}`);
    } catch (e: any) {
      setToast(null);
      alert(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="pageHead">
        <div>
          <h1 className="h1">Edit search #{id}</h1>
          <p className="muted">Update search fields, marketplaces, and alert settings.</p>
        </div>
        <div className="ctaRow">
          <a className="btn" href={`/saved-searches/${id}`}>Back</a>
        </div>
      </div>

      {toast ? <div className="flash ok" style={{ marginTop: 10 }}>{toast}</div> : null}

      <div className="panel">
        <h2 className="h2" style={{ marginTop: 0 }}>Search</h2>

        <label>Search item</label>
        <input value={item} onChange={(e) => setItem(e.target.value)} />

        <div className="grid2">
          <div>
            <label>Location</label>
            <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label>Category</label>
            <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <label>Max price</label>
        <input value={max} onChange={(e) => setMax(e.target.value)} placeholder="Optional" />

        <hr style={{ margin: "18px 0", opacity: 0.2 }} />

        <h2 className="h2">Marketplaces</h2>
        <p className="muted" style={{ marginTop: 6 }}>Choose where GoSnaggit should search for this saved search.</p>

        <div className="rowActions" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {(["ebay", "etsy", "facebook", "craigslist"] as MpKey[]).map((k) => (
            <button
              key={k}
              className={"btn" + (mps[k] ? " primary" : "")}
              type="button"
              onClick={() => toggleMp(k)}
              disabled={busy}
              title={mps[k] ? "Enabled" : "Disabled"}
            >
              {k.toUpperCase()}: {mps[k] ? "ON" : "OFF"}
            </button>
          ))}
        </div>

        <hr style={{ margin: "18px 0", opacity: 0.2 }} />

        <h2 className="h2">Alerts</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Control whether alerts can send, and whether they send immediately or as a daily digest.
        </p>

        <div className="rowActions" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button
            className={"btn" + (alertsEnabled ? " primary" : "")}
            type="button"
            onClick={() => setAlertsEnabled(v => !v)}
            disabled={busy}
          >
            Alerts: {alertsEnabled ? "ON" : "OFF"}
          </button>

          <button
            className={"btn" + (alertMode === "immediate" ? " primary" : "")}
            type="button"
            onClick={() => setAlertMode("immediate")}
            disabled={busy || !alertsEnabled}
          >
            Immediate
          </button>

          <button
            className={"btn" + (alertMode === "daily" ? " primary" : "")}
            type="button"
            onClick={() => setAlertMode("daily")}
            disabled={busy || !alertsEnabled}
          >
            Daily digest
          </button>
        </div>

        <div className="grid2" style={{ marginTop: 12 }}>
          <div>
            <label>Max alerts per email</label>
            <input
              value={String(maxPerEmail)}
              onChange={(e) => setMaxPerEmail(Number(e.target.value))}
              disabled={busy || !alertsEnabled}
              placeholder="25"
            />
          </div>
          <div>
            <label className="muted">Tip</label>
            <div className="muted" style={{ paddingTop: 10 }}>
              “Daily digest” sends at most once per day (unless forced).
            </div>
          </div>
        </div>

        <hr style={{ margin: "18px 0", opacity: 0.2 }} />

        <h2 className="h2">Email notifications</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Alerts can only email if an email destination is saved for this search.
        </p>

        <div className="rowActions" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button
            className={"btn" + (emailEnabled ? " primary" : "")}
            type="button"
            onClick={() => setEmailEnabled(v => !v)}
            disabled={busy}
          >
            Email: {emailEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <label style={{ marginTop: 12 }}>Email address</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
        />
        {!canSaveEmail ? (
          <div className="muted" style={{ marginTop: 6 }}>
            Enter an email address to enable email notifications.
          </div>
        ) : null}

        <div className="ctaRow" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={onSave} disabled={busy || !canSaveEmail}>
            {busy ? "Saving…" : "Save all changes"}
          </button>
          <a className="btn" href={`/saved-searches/${id}`}>Cancel</a>
        </div>
      </div>
    </main>
  );
}
