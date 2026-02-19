// app.js

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const pool = require('./db');
const { getEbayAppToken } = require('./services/ebayAuth');
const { insertResults } = require('./services/resultsStore');
const { createNewListingAlert } = require('./services/alerts');
const {
  sendEmail,
  buildAlertEmail,
  buildSignupConfirmationEmail,
  buildNewSignupNoticeEmail,
} = require('./services/notifications');
const { enqueueRefreshJobForSearch } = require('./services/jobs');
const { dispatchPendingAlertsForSearch, requeueStuckSendingAlerts } = require('./services/dispatchAlerts');
const { setTierAndReschedule } = require('./services/schedule');   // ← add this line
const { normalizeTier, maxSearchesForTier } = require('./services/tiers');

const {
  getAlertSettingsForSearchId,
  setAlertSettingsForSearchId,
  markDigestSentForSearchId,
  hasDigestBeenSentToday,
} = require('./services/alertSettingsStore');



const app = express();
const PORT = process.env.PORT || 3000;


// --------------------
// Alert settings (enabled / mode / maxPerEmail) API
// --------------------

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  if (reason && typeof reason === 'object' && 'stack' in reason) {
    console.error(reason.stack);
  }
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (err && err.stack) console.error(err.stack);
});

app.disable('x-powered-by');
app.set('trust proxy', 1);

if (typeof fetch !== 'function') {
  throw new Error('This app requires Node.js 18+ (global fetch is not available).');
}

// --------------------
// Middleware
// --------------------
app.use(express.json());

// --------------------
// Alert settings routes (support BOTH /searches and /api/searches)
// --------------------

async function alertSettingsHandlerGET(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    const settings = await getAlertSettingsForSearchId(pool, id);
    return res.json({ ok: true, search_id: Number(id) || id, settings });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to load alert settings" });
  }
}

async function alertSettingsHandlerWRITE(req, res) {
  try {
    const id = String(req.params.id || "").trim();

    // accept either {settings:{...}} or direct fields
    const incoming = (req.body && typeof req.body === "object")
      ? (req.body.settings && typeof req.body.settings === "object" ? req.body.settings : req.body)
      : {};

    const current = await getAlertSettingsForSearchId(pool, id);
    const next = Object.assign({}, current, incoming);

    const ok = await setAlertSettingsForSearchId(pool, id, next);
    if (!ok) return res.status(400).json({ ok: false, error: "Invalid search id" });

    const settings = await getAlertSettingsForSearchId(pool, id);
    return res.json({ ok: true, search_id: Number(id) || id, settings });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to save alert settings" });
  }
}


// canonical backend paths (what your Next proxy is calling)
app.get("/searches/:id/alert-settings", alertSettingsHandlerGET);
app.post("/searches/:id/alert-settings", alertSettingsHandlerWRITE);
app.put("/searches/:id/alert-settings", alertSettingsHandlerWRITE);

// ALSO allow /api/searches (in case anything still calls it)
app.get("/api/searches/:id/alert-settings", alertSettingsHandlerGET);
app.post("/api/searches/:id/alert-settings", alertSettingsHandlerWRITE);
app.put("/api/searches/:id/alert-settings", alertSettingsHandlerWRITE);


// ---- Alert settings API ----

app.use(express.static(path.join(__dirname, 'public')));

app.use(helmet({
  // Full CSP would break your current inline scripts/styles unless configured carefully.
  contentSecurityPolicy: false
}));

const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET',
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
});

// Apply to API surfaces (includes your legacy non-/api JSON routes)
app.use(['/api', '/searches', '/results', '/alerts'], readLimiter);
app.use(['/api', '/searches', '/results', '/alerts'], writeLimiter);



// ✅ INSERT HERE
// --------------------
// Client config (marketplaces availability)
// --------------------
app.get('/api/config', (req, res) => {
  const etsyEnabled = process.env.MARKETPLACE_ETSY === 'true';

  res.json({
    ok: true,
    marketplaces: {
      ebay: { available: true },
      etsy: { available: etsyEnabled }
    }
  });
});

// --------------------
// Helpers
// --------------------
function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function clampInt(value, { min, max, fallback }) {
  const n = toInt(value);
  if (n === null) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseMoneyToNumber(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function normalizeEmail(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  if (s.length > 254) return null;

  // Basic sanity check (not perfect, but blocks obvious junk)
  const at = s.indexOf('@');
  if (at <= 0) return null;
  if (s.indexOf('.', at) === -1) return null;
  if (s.includes(' ')) return null;

  return s.toLowerCase();
}


function normalizeMarketplaces(input) {
  const def = { ebay: true, etsy: false, facebook: false, craigslist: false };
  if (!input || typeof input !== 'object') return def;

  const out = { ...def };
  for (const k of Object.keys(def)) {
    if (k in input) out[k] = !!input[k];
  }
  return out;
}

function methodNotAllowed(allowed) {
  return (req, res) => {
    res.status(405).json({
      ok: false,
      error: "Method Not Allowed",
      method: req.method,
      allowed,
      path: req.originalUrl
    });
  };
}

// --------------------
// Health
// --------------------
app.get('/health', (req, res) => {
  res.json({ ok: true });
});
app.all('/health', methodNotAllowed(['GET']));
// --------------------
// eBay (DEV token peek)
// --------------------
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/ebay/token', async (req, res) => {
    try {
      const token = await getEbayAppToken();
      res.json({ ok: true, tokenStartsWith: token.slice(0, 20) });
    } catch (err) {
      console.error('GET /api/ebay/token failed:', err);
      res.status(500).json({ ok: false, error: 'Failed to get eBay token' });
    }
  });

  app.all('/api/ebay/token', methodNotAllowed(['GET']));
}

// --------------------
// eBay Search (raw payload)
// --------------------
app.get('/api/ebay/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = clampInt(req.query.limit, { min: 1, max: 50, fallback: 10 });

    if (!q) return res.status(400).json({ ok: false, error: 'Missing required query param: q' });

    const token = await getEbayAppToken();

    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, ebayError: data });
    }

    res.json({ ok: true, ebay: data });
  } catch (err) {
    console.error('GET /api/ebay/search failed:', err);
    res.status(500).json({ ok: false, error: 'Failed to search eBay' });
  }
});
app.all('/api/ebay/search', methodNotAllowed(['GET']));
// --------------------
// DEV: Seed results for a search_id
// --------------------
if (process.env.NODE_ENV !== 'production') {
  app.post('/dev/seed-results', async (req, res) => {
    try {
      const searchId = toInt(req.query.search_id ?? req.body?.search_id);
      if (searchId === null) return res.status(400).json({ error: 'Missing or invalid search_id' });

      const count = clampInt(req.query.count ?? req.body?.count, { min: 1, max: 200, fallback: 12 });

      const marketplaces = ['ebay', 'etsy', 'facebook', 'craigslist'];
      const conditions = ['New', 'Used', 'Open box', 'Refurbished'];
      const locations = ['Los Angeles', 'New York', 'Chicago', 'Online', 'San Francisco'];

      const items = [];
      for (let i = 0; i < count; i++) {
        const marketplace = marketplaces[i % marketplaces.length];
        const condition = conditions[i % conditions.length];
        const location = locations[i % locations.length];

        const price = Number((Math.random() * 900 + 50).toFixed(2));
        const externalId = `SEED-${searchId}-${Date.now()}-${i}`;
        const title = `Seed Listing ${i + 1} (Search ${searchId})`;
        const currency = 'USD';
        const listingUrl = `https://example.com/seed/${searchId}/${i + 1}`;
        const imageUrl = `https://example.com/image.jpg`;
        const seller = `seed_seller_${(i % 8) + 1}`;

        const minutesAgo = Math.floor(Math.random() * 60 * 24 * 7);
        const foundAt = new Date(Date.now() - minutesAgo * 60 * 1000);

        items.push({
          marketplace,
          external_id: externalId,
          title,
          price,
          currency,
          listing_url: listingUrl,
          image_url: imageUrl,
          location,
          condition,
          seller_username: seller,
          found_at: foundAt.toISOString(),
          raw: { seeded: true, searchId, i, found_at: foundAt.toISOString() },
        });
      }

      const grouped = items.reduce((acc, it) => {
        (acc[it.marketplace] ||= []).push(it);
        return acc;
      }, {});

      let totalInserted = 0;

      for (const [marketplace, groupItems] of Object.entries(grouped)) {
        const cleaned = groupItems.map(({ marketplace: _m, ...rest }) => rest);
        const out = await insertResults(pool, searchId, marketplace, cleaned);
        totalInserted += out.inserted || 0;
      }

      res.json({
        ok: true,
        inserted: totalInserted,
        marketplaces: Object.keys(grouped),
        hint: `Try GET /searches/${searchId}/results and GET /searches/${searchId}/alerts`,
      });
    } catch (err) {
      console.error('POST /dev/seed-results failed:', err);
      res.status(500).json({ error: 'Failed to seed results' });
    }
  });
  // --------------------
  // DEV: Seed alert_events from existing results for a search_id
  // --------------------
  app.post('/dev/seed-alerts', async (req, res) => {
    try {
      const searchId = toInt(req.query.search_id ?? req.body?.search_id);
      if (searchId === null) return res.status(400).json({ error: 'Missing or invalid search_id' });

      const limit = clampInt(req.query.limit ?? req.body?.limit, { min: 1, max: 200, fallback: 10 });

      const r = await pool.query(
        `
      SELECT id, marketplace, external_id
      FROM results
      WHERE search_id = $1
      ORDER BY found_at DESC NULLS LAST, id DESC
      LIMIT $2
      `,
        [searchId, limit]
      );

      let inserted = 0;
      for (const row of r.rows) {
        const a = await createNewListingAlert({
          pool,
          searchId,
          resultId: row.id,
          marketplace: row.marketplace,
          externalId: row.external_id,
        });
        if (a.inserted) inserted += 1;
      }

      res.json({ ok: true, searchId, considered: r.rowCount, inserted });
    } catch (err) {
      console.error('POST /dev/seed-alerts failed:', err);
      res.status(500).json({ ok: false, error: 'Failed to seed alerts' });
    }
  });
}

// --------------------
// Searches CRUD
// --------------------
async function createSearch(req, res) {
  try {
    const { search_item, location, category, max_price, status, plan_tier, tier } = req.body || {};
    const maxPriceNum = parseMoneyToNumber(max_price);

    if (!search_item || String(search_item).trim() === '') {
      return res.status(400).json({ error: 'search_item is required' });
    }

    const finalStatus = status ?? 'active';
    const finalTier = normalizeTier(plan_tier ?? tier ?? 'free');

    const marketplaces = normalizeMarketplaces(req.body.marketplaces);

    const result = await pool.query(
      `
  INSERT INTO searches (search_item, location, category, max_price, status, plan_tier, marketplaces)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING *
  `,
      [
        String(search_item).trim(),
        location ?? null,
        category ?? null,
        maxPriceNum,
        finalStatus,
        finalTier,
        marketplaces
      ]

    );


    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /searches failed:', err);
    res.status(500).json({ error: 'Failed to create search' });
  }
}

app.post('/searches', createSearch);
app.post('/api/searches', createSearch);


async function patchSearch(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    // Build a partial update: only fields that exist in the request get updated.
    const sets = [];
    const values = [];
    let idx = 1;

    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

    if (has('search_item')) {
      const v = String(body.search_item ?? '').trim();
      if (!v) return res.status(400).json({ error: 'search_item is required' });
      sets.push(`search_item = $${idx++}`);
      values.push(v);
    }

    if (has('location')) {
      const v = String(body.location ?? '').trim();
      sets.push(`location = $${idx++}`);
      values.push(v ? v : null);
    }

    if (has('category')) {
      const v = String(body.category ?? '').trim();
      sets.push(`category = $${idx++}`);
      values.push(v ? v : null);
    }

    if (has('max_price')) {
      // Allow clearing max_price by sending null/"".
      const raw = body.max_price;
      if (raw === null || raw === '') {
        sets.push(`max_price = $${idx++}`);
        values.push(null);
      } else {
        const maxPriceNum = parseMoneyToNumber(raw);
        if (Number.isNaN(Number(maxPriceNum))) {
          return res.status(400).json({ error: 'max_price must be a number' });
        }
        sets.push(`max_price = $${idx++}`);
        values.push(maxPriceNum);
      }
    }

    if (has('status')) {
      const status = body.status;
      const allowedStatuses = ['active', 'paused', 'completed', 'cancelled', 'deleted'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'.",
        });
      }
      sets.push(`status = $${idx++}`);
      values.push(status || null);
    }

    if (has('marketplaces')) {
      const marketplaces = normalizeMarketplaces(body.marketplaces);
      sets.push(`marketplaces = $${idx++}`);
      values.push(marketplaces);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    values.push(id);
    const sql = `
      UPDATE searches
      SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await pool.query(sql, values);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json({ message: 'Search updated', search: result.rows[0] });
  } catch (err) {
    console.error('PATCH search failed:', err);
    res.status(500).json({ error: 'Failed to update search' });
  }
}

app.patch('/searches/:id', patchSearch);
app.patch('/api/searches/:id', patchSearch);

async function getSearches(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT
        s.*,
        r.last_found_at,
        COALESCE(n.email_enabled, FALSE) AS email_enabled,
        n.email_destination
      FROM searches s
      LEFT JOIN (
        SELECT search_id, MAX(found_at) AS last_found_at
        FROM results
        GROUP BY search_id
      ) r ON r.search_id = s.id
      LEFT JOIN (
        SELECT
          search_id,
          BOOL_OR(is_enabled) FILTER (WHERE channel = 'email' AND destination IS NOT NULL) AS email_enabled,
          MAX(destination) FILTER (WHERE channel = 'email' AND is_enabled = TRUE AND destination IS NOT NULL) AS email_destination
        FROM notification_settings
        GROUP BY search_id
      ) n ON n.search_id = s.id
      WHERE s.status IS NULL OR s.status <> 'deleted'
      ORDER BY r.last_found_at DESC NULLS LAST, s.created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /searches failed:', err);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
}



app.get('/api/searches', getSearches);
app.get('/searches', getSearches); // keep old working for now


app.get('/searches/deleted', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM searches
      WHERE status = 'deleted'
      ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /searches/deleted failed:', err);
    res.status(500).json({ error: 'Failed to fetch deleted searches' });
  }
});

app.get('/api/searches/deleted', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM searches
      WHERE status = 'deleted'
      ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/searches/deleted failed:', err);
    res.status(500).json({ error: 'Failed to fetch deleted searches' });
  }
});

app.get('/api/searches/:id/notification-status', async (req, res) => {
  try {
    const searchId = Number(req.params.id);
    if (!Number.isFinite(searchId) || searchId <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid search id' });
    }

    const { rows } = await pool.query(
      `
      SELECT
        COALESCE(BOOL_OR(is_enabled) FILTER (WHERE channel = 'email' AND destination IS NOT NULL), FALSE) AS email_enabled,
        MAX(destination) FILTER (WHERE channel = 'email' AND is_enabled = TRUE AND destination IS NOT NULL) AS email_destination
      FROM notification_settings
      WHERE search_id = $1
      `,
      [searchId]
    );

    const row = rows && rows[0] ? rows[0] : {};
    return res.json({
      ok: true,
      search_id: searchId,
      email_enabled: !!row.email_enabled,
      email_destination: row.email_destination || null
    });
  } catch (err) {
    console.error('GET /api/searches/:id/notification-status failed:', err);
    return res.status(500).json({ ok: false, error: 'failed to load notification status' });
  }
});


app.get('/searches/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT * FROM searches WHERE id = $1', [id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /searches/:id failed:', err);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

app.get('/api/searches/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT * FROM searches WHERE id = $1', [id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /api/searches/:id failed:', err);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

app.patch('/searches/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const allowed = ['active', 'paused', 'completed', 'cancelled', 'deleted'];
    if (!status || !allowed.includes(status)) {
      return res
        .status(400)
        .json({ error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'." });
    }

    const result = await pool.query('UPDATE searches SET status = $1 WHERE id = $2 RETURNING *', [status, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json({ message: 'Status updated', search: result.rows[0] });
  } catch (err) {
    console.error('PATCH /searches/:id/status failed:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

app.patch('/api/searches/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    const allowed = ['active', 'paused', 'completed', 'cancelled', 'deleted'];
    if (!status || !allowed.includes(status)) {
      return res
        .status(400)
        .json({ error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'." });
    }

    const result = await pool.query('UPDATE searches SET status = $1 WHERE id = $2 RETURNING *', [status, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json({ message: 'Status updated', search: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/searches/:id/status failed:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// --------------------
// Search tier (Free / Pro / Power)
// --------------------
app.patch('/api/searches/:id/tier', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) {
      return res.status(400).json({ ok: false, error: 'Invalid search id' });
    }

    const tierRaw = req.body?.tier;
    if (!tierRaw) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const requested = normalizeTier(tierRaw);

    // --- recommended robustness block (NEW) ---
    const cur = await pool.query('SELECT plan_tier, status FROM searches WHERE id = $1', [searchId]);
    if (cur.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Search not found' });
    }

    if (String(cur.rows[0].status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ ok: false, error: 'Cannot change tier for a deleted search' });
    }

    const current = normalizeTier(cur.rows[0].plan_tier);
    if (current === requested) {
      // no change; never block due to cap
      return res.json({ ok: true, search_id: searchId, plan_tier: current });
    }
    // --- end robustness block ---

    const cap = maxSearchesForTier(requested);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM searches
       WHERE status <> 'deleted'
         AND plan_tier = $1`,
      [requested]
    );

    const n = countRes.rows?.[0]?.n ?? 0;

    if (n >= cap) {
      return res.status(403).json({
        ok: false,
        error: `Tier limit reached for ${requested.toUpperCase()}. Max ${cap} saved searches on this tier.`
      });
    }

    const updatedTier = await setTierAndReschedule(searchId, requested);
    res.json({ ok: true, search_id: searchId, plan_tier: updatedTier });
  } catch (e) {
    console.error('PATCH /api/searches/:id/tier failed:', e);
    res.status(500).json({ ok: false, error: 'Failed to update tier' });
  }
});



app.patch('/searches/:id/tier', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) {
      return res.status(400).json({ ok: false, error: 'Invalid search id' });
    }

    const tierRaw = req.body?.tier;
    if (!tierRaw) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const requested = normalizeTier(tierRaw);

    // --- recommended robustness block (NEW) ---
    const cur = await pool.query('SELECT plan_tier, status FROM searches WHERE id = $1', [searchId]);
    if (cur.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Search not found' });
    }

    if (String(cur.rows[0].status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ ok: false, error: 'Cannot change tier for a deleted search' });
    }

    const current = normalizeTier(cur.rows[0].plan_tier);
    if (current === requested) {
      return res.json({ ok: true, search_id: searchId, plan_tier: current });
    }
    // --- end robustness block ---

    const cap = maxSearchesForTier(requested);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM searches
       WHERE status <> 'deleted'
         AND plan_tier = $1`,
      [requested]
    );

    const n = countRes.rows?.[0]?.n ?? 0;

    if (n >= cap) {
      return res.status(403).json({
        ok: false,
        error: `Tier limit reached for ${requested.toUpperCase()}. Max ${cap} saved searches on this tier.`
      });
    }

    const updatedTier = await setTierAndReschedule(searchId, requested);
    res.json({ ok: true, search_id: searchId, plan_tier: updatedTier });
  } catch (e) {
    console.error('PATCH /searches/:id/tier failed:', e);
    res.status(500).json({ ok: false, error: 'Failed to update tier' });
  }
});


async function deleteSearch(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE searches
      SET status = 'deleted'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json({ message: 'Search soft-deleted (status set to "deleted")', search: result.rows[0] });
  } catch (err) {
    console.error('DELETE search failed:', err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
}

app.delete('/searches/:id', deleteSearch);
app.delete('/api/searches/:id', deleteSearch);


async function duplicateSearch(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
  INSERT INTO searches (search_item, location, category, max_price, status, plan_tier, marketplaces)
  SELECT search_item, location, category, max_price, status, plan_tier, marketplaces
  FROM searches
  WHERE id = $1
  RETURNING *;
  `,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST duplicate search failed:', err);
    res.status(500).json({ error: 'Failed to duplicate search' });
  }
}

app.post('/searches/:id/duplicate', duplicateSearch);
app.post('/api/searches/:id/duplicate', duplicateSearch);


// --------------------
// Results
// --------------------
async function getSearchResults(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) {
      return res.status(400).json({ error: 'Invalid search id' });
    }

    const limitNum = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const offsetNum = clampInt(req.query.offset, { min: 0, max: 1_000_000, fallback: 0 });

    const sql = `
SELECT
  id,
  search_id,
  marketplace,
  external_id,
  title,
  price,
  currency,
  price_num,
  shipping_num,
  total_price,
  listing_url,
  image_url,
  location,
  condition,
  seller_username,
  found_at

      FROM results
      WHERE search_id = $1
      ORDER BY found_at DESC, id DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(sql, [searchId, limitNum, offsetNum]);
    res.json(rows);
  } catch (err) {
    console.error('GET /searches/:id/results failed:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
}

async function postSearchResults(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) {
      return res.status(400).json({ error: 'Invalid search id' });
    }

    const marketplace = (req.body?.marketplace || '').toString().trim().toLowerCase();
    const items = req.body?.results;

    if (!marketplace) {
      return res.status(400).json({ error: 'marketplace is required (e.g. "ebay")' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'results must be an array' });
    }

    const { inserted } = await insertResults(pool, searchId, marketplace, items);
    res.json({ message: 'Results saved', inserted: inserted || 0 });
  } catch (err) {
    console.error('POST /searches/:id/results failed:', err);
    res.status(500).json({ error: 'Failed to save results' });
  }
}

async function getSearchPricingSummary(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE price_num IS NOT NULL) AS priced_count,
        MIN(price_num) AS min_price,
        MAX(price_num) AS max_price,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price_num) AS median_price
      FROM results
      WHERE search_id = $1
    `;

    const { rows } = await pool.query(sql, [searchId]);
    const r = rows[0] || {};

    res.json({
      search_id: searchId,
      priced_count: Number(r.priced_count || 0),
      min_price: r.min_price,
      max_price: r.max_price,
      median_price: r.median_price,
      currency: 'USD'
    });
  } catch (err) {
    console.error('GET pricing summary failed:', err);
    res.status(500).json({ error: 'Failed to fetch pricing summary' });
  }
}


app.get('/searches/:id/results', getSearchResults);
app.get('/api/searches/:id/results', getSearchResults);

app.post('/searches/:id/results', postSearchResults);
app.post('/api/searches/:id/results', postSearchResults);

app.all('/searches/:id/results', methodNotAllowed(['GET', 'POST']));
app.all('/api/searches/:id/results', methodNotAllowed(['GET', 'POST']));

app.get('/searches/:id/pricing-summary', getSearchPricingSummary);
app.get('/api/searches/:id/pricing-summary', getSearchPricingSummary);


// --------------------
// Refresh (enqueue only)
// --------------------

async function refreshSearchHandler(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const check = await pool.query('SELECT id, status FROM searches WHERE id = $1', [searchId]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    if ((check.rows[0].status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ error: 'Cannot refresh a deleted search' });
    }

    await enqueueRefreshJobForSearch(searchId);

    res.json({ ok: true, enqueued: true, job_type: 'refresh', searchId });
  } catch (err) {
    console.error('POST refresh enqueue failed:', err);
    res.status(500).json({ error: 'Failed to enqueue refresh' });
  }
}

// Dev-only routes
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev/searches/:id/refresh', refreshSearchHandler);

  // Dev: dispatch pending email alerts for a search (respects cooldown)
  // Example: GET /dev/searches/2/dispatch-alerts?limit=25
  app.get('/dev/searches/:id/dispatch-alerts', async (req, res) => {
    try {
      const searchId = parseInt(req.params.id, 10);
      if (Number.isNaN(searchId)) return res.status(400).json({ error: 'Invalid search id' });

      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 25, 200));


      // Respect per-search alert settings (server-backed)
      const force = String(req.query.force || '').toLowerCase();
      const settings = await getAlertSettingsForSearchId(pool, searchId);
      // Daily digest guard: only allow ONE send per local day (unless force)
      if (settings.mode === 'daily' && hasDigestBeenSentToday(settings) && force !== '1' && force !== 'true' && force !== 'yes') {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'daily_already_sent',
          search_id: searchId,
          settings,
        });
      }

      if (!settings.enabled && force !== '1' && force !== 'true' && force !== 'yes') {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'alerts_disabled',
          search_id: searchId,
          settings,
        });
      }


      // Pull enabled email destination for this search
      const { rows } = await pool.query(
        `
        SELECT destination
        FROM notification_settings
        WHERE search_id = $1
          AND channel = 'email'
          AND is_enabled = TRUE
          AND destination IS NOT NULL
        LIMIT 1
        `,
        [searchId]
      );

      if (!rows || rows.length === 0) {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'no_email_enabled',
          search_id: searchId,
          message: 'Email notifications are not enabled for this search. Enable an email destination in Search Detail → Alerts.',
        });
      }

      const toEmail = rows[0].destination;

      const result = await dispatchPendingAlertsForSearch({
        pool,
        searchId,
        toEmail,
        limit,
      });

      // If this search is in daily digest mode and we actually sent an email,
      // record that we sent the digest today so we don't send again until tomorrow.
      if (settings && settings.mode === 'daily' && result && Number(result.sent || 0) > 0) {
        await markDigestSentForSearchId(pool, searchId, new Date().toISOString());
      }

      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('GET /dev/searches/:id/dispatch-alerts failed:', err);
      return res.status(500).json({
        ok: false,
        error: 'Failed to dispatch alerts',
        details: err?.message || String(err),
        stack: err?.stack || null,
      });
    }
  });

  // Dev: dispatch pending email alerts for a search (ignores cooldown)
  // Example: GET /dev/searches/2/dispatch-alerts-now?limit=25
  app.get('/dev/searches/:id/dispatch-alerts-now', async (req, res) => {
    try {
      const searchId = parseInt(req.params.id, 10);
      if (Number.isNaN(searchId)) return res.status(400).json({ error: 'Invalid search id' });

      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 25, 200));


      // Respect per-search alert settings (server-backed)
      const force = String(req.query.force || '').toLowerCase();
      const settings = getAlertSettingsForSearchId(searchId);
      // Daily digest guard: only allow ONE send per local day (unless force)
      if (settings.mode === 'daily' && hasDigestBeenSentToday(settings) && force !== '1' && force !== 'true' && force !== 'yes') {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'daily_already_sent',
          search_id: searchId,
          settings,
        });
      }

      if (!settings.enabled && force !== '1' && force !== 'true' && force !== 'yes') {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'alerts_disabled',
          search_id: searchId,
          settings,
        });
      }


      // Pull enabled email destination for this search
      const { rows } = await pool.query(
        `
        SELECT destination
        FROM notification_settings
        WHERE search_id = $1
          AND channel = 'email'
          AND is_enabled = TRUE
          AND destination IS NOT NULL
        LIMIT 1
        `,
        [searchId]
      );

      if (!rows || rows.length === 0) {
        return res.json({
          ok: true,
          skipped: true,
          reason: 'no_email_enabled',
          search_id: searchId,
          message: 'Email notifications are not enabled for this search. Enable an email destination in Search Detail → Alerts.',
        });
      }

      const toEmail = rows[0].destination;

      const result = await dispatchPendingAlertsForSearch({
        pool,
        searchId,
        toEmail,
        limit,
        ignoreCooldown: true,
      });

      // If this search is in daily digest mode and we actually sent an email,
      // record that we sent the digest today so we don't send again until tomorrow.
      if (settings && settings.mode === 'daily' && result && Number(result.sent || 0) > 0) {
        markDigestSentForSearchId(searchId, new Date().toISOString());
      }

      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('GET /dev/searches/:id/dispatch-alerts-now failed:', err);
      return res.status(500).json({
        ok: false,
        error: 'Failed to dispatch alerts (now)',
        details: err?.message || String(err),
        stack: err?.stack || null,
      });
    }
  });

  // Dev: requeue stuck "sending" alerts back to pending
  // Example: GET /dev/requeue-stuck-alerts?minutes=10&limit=500&searchId=2
  app.get('/dev/requeue-stuck-alerts', async (req, res) => {
    try {
      const minutes = Math.max(1, Math.min(parseInt(req.query.minutes, 10) || 10, 1440));
      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 500, 5000));

      const sidRaw = req.query.searchId;
      const searchId =
        sidRaw === undefined || sidRaw === null || sidRaw === ''
          ? null
          : Number(sidRaw);

      const result = await requeueStuckSendingAlerts({ pool, stuckMinutes: minutes, searchId, limit });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: 'Failed to requeue stuck sending alerts',
        details: err?.message || String(err),
        stack: err?.stack || null,
      });
    }
  });

} // <-- IMPORTANT: dev-only block ends here

// GET refresh info (does not enqueue; safe to call from browser)
async function getRefreshInfo(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) {
      return res.status(400).json({ error: 'Invalid search id' });
    }

    const check = await pool.query(
      'SELECT id, status FROM searches WHERE id = $1',
      [searchId]
    );

    if (check.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json({
      ok: true,
      searchId,
      status: check.rows[0].status,
      note: 'GET does not enqueue. Use POST to request a refresh.',
    });
  } catch (err) {
    console.error('GET refresh info failed:', err);
    res.status(500).json({ error: 'Failed to load refresh info' });
  }
}

app.get('/searches/:id/refresh', getRefreshInfo);
app.get('/api/searches/:id/refresh', getRefreshInfo);


// --------------------
// Refresh (public API)
// GET  /searches/:id/refresh      -> info about next refresh / status
// POST /searches/:id/refresh      -> trigger a refresh now
// (same for /api/* mirrors)
// --------------------
app.post('/searches/:id/refresh', refreshSearchHandler);
app.post('/api/searches/:id/refresh', refreshSearchHandler);
app.all('/searches/:id/refresh', methodNotAllowed(['GET', 'POST']));
app.all('/api/searches/:id/refresh', methodNotAllowed(['GET', 'POST']));


// --------------------
// Alerts feed + status patch
// --------------------
async function getSearchAlerts(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const limitNum = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const offsetNum = clampInt(req.query.offset, { min: 0, max: 1_000_000, fallback: 0 });

    const statusRaw = (req.query.status ?? '').toString().trim().toLowerCase();
    const statusParam = (!statusRaw || statusRaw === 'all') ? null : statusRaw;

    const sql = `
      SELECT
        ae.id         AS alert_id,
        ae.search_id,
        ae.status,
        ae.created_at AS alert_created_at,
        r.title,
        r.price,
        r.currency,
        r.listing_url,
        r.marketplace,
        r.external_id
      FROM alert_events ae
      LEFT JOIN results r ON r.id = ae.result_id
      WHERE ae.search_id = $1
        AND ($2::text IS NULL OR ae.status = $2)
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $3 OFFSET $4
    `;

    const { rows } = await pool.query(sql, [searchId, statusParam, limitNum, offsetNum]);
    res.json(rows);
  } catch (err) {
    console.error('GET search alerts failed:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

app.get('/api/searches/:id/alerts', getSearchAlerts);
app.get('/searches/:id/alerts', getSearchAlerts);
app.all('/api/searches/:id/alerts', methodNotAllowed(['GET']));
app.all('/searches/:id/alerts', methodNotAllowed(['GET']));

// Send Now (non-dev): dispatch pending alerts for a search (respects cooldown/settings)
// Example: POST /api/searches/2/alerts/send-now?limit=25
async function sendNowHandler(req, res) {
  try {
    const searchId = parseInt(req.params.id, 10);
    if (Number.isNaN(searchId)) return res.status(400).json({ error: 'Invalid search id' });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 25, 200));

    // Respect per-search alert settings (server-backed)
    const force = String(req.query.force || '').toLowerCase();
    const settings = getAlertSettingsForSearchId(searchId);

    // Daily digest guard: only allow ONE send per local day (unless force)
    if (
      settings.mode === 'daily' &&
      hasDigestBeenSentToday(settings) &&
      force !== '1' && force !== 'true' && force !== 'yes'
    ) {
      return res.json({
        ok: true,
        skipped: true,
        reason: 'daily_already_sent',
        search_id: searchId,
        settings,
      });
    }

    if (!settings.enabled && force !== '1' && force !== 'true' && force !== 'yes') {
      return res.json({
        ok: true,
        skipped: true,
        reason: 'alerts_disabled',
        search_id: searchId,
        settings,
      });
    }

    // Pull enabled email destination for this search
    const { rows } = await pool.query(
      `
      SELECT destination
      FROM notification_settings
      WHERE search_id = $1
        AND channel = 'email'
        AND is_enabled = TRUE
        AND destination IS NOT NULL
      LIMIT 1
      `,
      [searchId]
    );

    if (!rows || rows.length === 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: 'no_email_enabled',
        search_id: searchId,
        message: 'Email notifications are not enabled for this search. Enable an email destination in Search Detail → Alerts.',
      });
    }

    const toEmail = rows[0].destination;

    const result = await dispatchPendingAlertsForSearch({
      pool,
      searchId,
      toEmail,
      limit,
    });

    // If this search is in daily digest mode and we actually sent an email,
    // record that we sent the digest today so we don't send again until tomorrow.
    if (settings && settings.mode === 'daily' && result && Number(result.sent || 0) > 0) {
      markDigestSentForSearchId(searchId, new Date().toISOString());
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /api/searches/:id/alerts/send-now failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'Failed to dispatch alerts',
      details: err?.message || String(err),
      stack: err?.stack || null,
    });
  }
}

app.post('/api/searches/:id/alerts/send-now', sendNowHandler);
app.post('/searches/:id/alerts/send-now', sendNowHandler);
app.all('/api/searches/:id/alerts/send-now', methodNotAllowed(['POST']));
app.all('/searches/:id/alerts/send-now', methodNotAllowed(['POST']));


async function patchAlertStatus(req, res) {
  try {
    const alertId = toInt(req.params.alert_id);
    if (alertId === null) return res.status(400).json({ error: 'Invalid alert id' });

    const statusRaw = req.body?.status;
    if (typeof statusRaw !== 'string') {
      return res.status(400).json({ error: 'status must be a string' });
    }

    let status = statusRaw.trim().toLowerCase();
    if (status === 'failed') status = 'error';

    const allowed = ['pending', 'sent', 'dismissed', 'error'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use: ${allowed.join(', ')}` });
    }

    const { rows } = await pool.query(
      `
      UPDATE alert_events
      SET status = $1
      WHERE id = $2
      RETURNING id AS alert_id, search_id, status, created_at
      `,
      [status, alertId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });

    res.json({ ok: true, alert: rows[0] });
  } catch (err) {
    console.error('PATCH alert status failed:', err);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
}

app.patch('/api/alerts/:alert_id/status', patchAlertStatus);
app.patch('/alerts/:alert_id/status', patchAlertStatus);
app.all('/api/alerts/:alert_id/status', methodNotAllowed(['PATCH']));
app.all('/alerts/:alert_id/status', methodNotAllowed(['PATCH']));
app.all('/api/searches/:id/tier', methodNotAllowed(['PATCH']));
app.all('/searches/:id/tier', methodNotAllowed(['PATCH']));

async function getSearchAlertsSummary(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const { rows } = await pool.query(
      `
      SELECT status, COUNT(*)::int AS count
      FROM alert_events
      WHERE search_id = $1
      GROUP BY status
      `,
      [searchId]
    );

    const counts = { pending: 0, sent: 0, dismissed: 0, error: 0 };
    for (const r of rows) {
      if (counts[r.status] !== undefined) counts[r.status] = r.count;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({ ok: true, search_id: searchId, counts, total });
  } catch (err) {
    console.error('GET /searches/:id/alerts/summary failed:', err);
    res.status(500).json({ error: 'Failed to load alerts summary' });
  }
}

app.get('/api/searches/:id/alerts/summary', getSearchAlertsSummary);
app.get('/searches/:id/alerts/summary', getSearchAlertsSummary);
app.all('/api/searches/:id/alerts/summary', methodNotAllowed(['GET']));
app.all('/searches/:id/alerts/summary', methodNotAllowed(['GET']));


// --------------------
// Notifications (email) MVP
// --------------------
async function notificationsEmailHandler(req, res) {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ ok: false, error: 'Invalid search id' });

    const { email, enabled } = req.body || {};
    const emailNorm = normalizeEmail(email);
    if (!emailNorm) return res.status(400).json({ ok: false, error: 'Valid email is required' });


    await pool.query(
      `
      INSERT INTO notification_settings (search_id, channel, destination, is_enabled)
      VALUES ($1, 'email', $2, COALESCE($3, TRUE))
      ON CONFLICT (search_id, channel)
      DO UPDATE SET destination=EXCLUDED.destination, is_enabled=EXCLUDED.is_enabled
      `,
      [searchId, emailNorm, enabled]
    );

    return res.json({
      ok: true,
      searchId,
      channel: 'email',
      destination: emailNorm,
      enabled: enabled ?? true,
    });
  } catch (err) {
    console.error('POST notifications email failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to save notification setting' });
  }
}

// Existing route (keep)
app.post('/searches/:id/notifications/email', notificationsEmailHandler);

// NEW: API mirror route (add)
app.post('/api/searches/:id/notifications/email', notificationsEmailHandler);

// Guards MUST come after the real handlers
app.all('/searches/:id/notifications/email', methodNotAllowed(['POST']));
app.all('/api/searches/:id/notifications/email', methodNotAllowed(['POST']));

// --------------------
// Registration (MVP) — emails admin + optional confirmation
// --------------------
app.post('/api/registrations', async (req, res) => {
  try {
    const { name, email, notes } = req.body || {};
    const emailNorm = normalizeEmail(email);
    if (!emailNorm) return res.status(400).json({ ok: false, error: 'Valid email is required' });

    const safeName = (name === undefined || name === null) ? '' : String(name).trim();
    const safeNotes = (notes === undefined || notes === null) ? '' : String(notes).trim();

    const to = process.env.SIGNUP_TO_EMAIL || process.env.INFO_TO_EMAIL || process.env.ALERTS_SMTP_USER || '';
    if (!to) return res.status(500).json({ ok: false, error: 'Missing SIGNUP_TO_EMAIL (or INFO_TO_EMAIL)' });

    const notice = buildNewSignupNoticeEmail({ customerEmail: emailNorm });
    const subject = notice.subject;
    const text = notice.text;


    // Admin notification (from info@ identity)
    const result = await sendEmail({ to, subject, text, kind: "signup" });

    // Optional: confirmation email to registrant
    const sendConfirmation = String(process.env.SIGNUP_SEND_CONFIRMATION || '').toLowerCase() === 'true';
    let confirmResult = null;

    if (sendConfirmation) {
      const supportEmail = process.env.SIGNUP_FROM_EMAIL || process.env.ALERTS_FROM_EMAIL || '';
      const confirm = buildSignupConfirmationEmail({ supportEmail });

      confirmResult = await sendEmail({
        to: emailNorm,
        subject: confirm.subject,
        text: confirm.text,
        kind: "signup",
      });
    }

    return res.json({ ok: true, delivered: result, confirmation: confirmResult });
  } catch (err) {
    console.error('POST /api/registrations failed:', err);
    return res.status(500).json({ ok: false, error: 'Failed to submit registration' });
  }
});

app.all('/api/registrations', methodNotAllowed(['POST']));


// --------------------
// 404 handler (keep last)
// --------------------
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not Found",
    method: req.method,
    path: req.originalUrl
  });
});

// --------------------
// Global error handler (must be AFTER routes, BEFORE listen)
// --------------------
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// --------------------
// Start server (keep truly last)
// --------------------
app.listen(PORT, () => {
  console.log(`GoSnaggit server is running on http://localhost:${PORT}`);
});
