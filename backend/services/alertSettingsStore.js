// backend/services/alertSettingsStore.js

const DEFAULTS = {
    enabled: true,
    mode: "immediate",
    maxPerEmail: 25,
    lastDigestSentAt: null,
};

function normalizeAlertSettings(input) {
    const s = Object.assign({}, DEFAULTS, (input || {}));

    s.enabled = !!s.enabled;
    s.mode = (s.mode === "daily") ? "daily" : "immediate";

    const mpe = Number(s.maxPerEmail);
    s.maxPerEmail =
        Number.isFinite(mpe) && mpe > 0
            ? Math.min(200, Math.max(1, Math.floor(mpe)))
            : DEFAULTS.maxPerEmail;

    const lds = s.lastDigestSentAt;
    s.lastDigestSentAt = (typeof lds === "string" && lds.trim()) ? lds.trim() : null;

    return s;
}

async function getAlertSettingsForSearchId(pool, searchId) {
    const id = Number(searchId);
    if (!Number.isFinite(id) || id <= 0) return normalizeAlertSettings(null);

    const { rows } = await pool.query(
        `
    SELECT enabled, mode, max_per_email, last_digest_sent_at
    FROM alert_settings
    WHERE search_id = $1
    `,
        [id]
    );

    if (!rows || rows.length === 0) return normalizeAlertSettings(null);

    const r = rows[0];
    return normalizeAlertSettings({
        enabled: r.enabled,
        mode: r.mode,
        maxPerEmail: r.max_per_email,
        lastDigestSentAt: r.last_digest_sent_at ? new Date(r.last_digest_sent_at).toISOString() : null,
    });
}

async function setAlertSettingsForSearchId(pool, searchId, nextSettings) {
    const id = Number(searchId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const next = normalizeAlertSettings(nextSettings);

    await pool.query(
        `
    INSERT INTO alert_settings (search_id, enabled, mode, max_per_email, last_digest_sent_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (search_id)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      mode = EXCLUDED.mode,
      max_per_email = EXCLUDED.max_per_email,
      last_digest_sent_at = EXCLUDED.last_digest_sent_at,
      updated_at = NOW()
    `,
        [id, next.enabled, next.mode, next.maxPerEmail, next.lastDigestSentAt]
    );

    return true;
}

async function markDigestSentForSearchId(pool, searchId, whenIso) {
    const id = Number(searchId);
    if (!Number.isFinite(id) || id <= 0) return false;

    const iso = whenIso || new Date().toISOString();

    // Ensure row exists, then update last_digest_sent_at
    await pool.query(
        `
    INSERT INTO alert_settings (search_id, enabled, mode, max_per_email, last_digest_sent_at, updated_at)
    VALUES ($1, TRUE, 'daily', 25, $2, NOW())
    ON CONFLICT (search_id)
    DO UPDATE SET
      last_digest_sent_at = EXCLUDED.last_digest_sent_at,
      updated_at = NOW()
    `,
        [id, iso]
    );

    return true;
}

function hasDigestBeenSentToday(settings) {
    try {
        const iso = settings && settings.lastDigestSentAt ? String(settings.lastDigestSentAt) : "";
        if (!iso) return false;
        const d = new Date(iso);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    } catch {
        return false;
    }
}

module.exports = {
    normalizeAlertSettings,
    getAlertSettingsForSearchId,
    setAlertSettingsForSearchId,
    markDigestSentForSearchId,
    hasDigestBeenSentToday,
};
