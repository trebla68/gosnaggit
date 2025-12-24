// app.js

require('dotenv').config();

const express = require('express');
const path = require('path');

const pool = require('./db');
const { getEbayAppToken } = require('./services/ebayAuth');
const { insertResults } = require('./services/resultsStore');

const app = express();
const PORT = process.env.PORT || 3000;

if (typeof fetch !== 'function') {
  throw new Error('This app requires Node.js 18+ (global fetch is not available).');
}

// --------------------
// Middleware
// --------------------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// --------------------
// Health
// --------------------
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

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
}

// --------------------
// Searches CRUD
// --------------------
app.post('/searches', async (req, res) => {
  try {
    const { search_item, location, category, max_price, status } = req.body || {};

    if (!search_item || String(search_item).trim() === '') {
      return res.status(400).json({ error: 'search_item is required' });
    }

    const finalStatus = status && String(status).trim() !== '' ? String(status).trim() : 'active';

    const result = await pool.query(
      `
      INSERT INTO searches (search_item, location, category, max_price, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [search_item, location || null, category || null, max_price ?? null, finalStatus]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /searches failed:', err);
    res.status(500).json({ error: 'Failed to create search' });
  }
});

app.get('/searches', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM searches
      WHERE status IS NULL OR status <> 'deleted'
      ORDER BY created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /searches failed:', err);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

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

app.patch('/searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { search_item, location, category, max_price, status } = req.body || {};

    if (!search_item || String(search_item).trim() === '') {
      return res.status(400).json({ error: 'search_item is required' });
    }

    const allowedStatuses = ['active', 'paused', 'completed', 'cancelled', 'deleted'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'.",
      });
    }

    const result = await pool.query(
      `
      UPDATE searches
      SET search_item = $1,
          location    = $2,
          category    = $3,
          max_price   = $4,
          status      = COALESCE($5, status)
      WHERE id = $6
      RETURNING *
      `,
      [search_item, location || null, category || null, max_price ?? null, status || null, id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.json({ message: 'Search updated', search: result.rows[0] });
  } catch (err) {
    console.error('PATCH /searches/:id failed:', err);
    res.status(500).json({ error: 'Failed to update search' });
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

app.delete('/searches/:id', async (req, res) => {
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
    console.error('DELETE /searches/:id failed:', err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

app.post('/searches/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      INSERT INTO searches (search_item, location, category, max_price, status)
      SELECT search_item, location, category, max_price, status
      FROM searches
      WHERE id = $1
      RETURNING *;
      `,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /searches/:id/duplicate failed:', err);
    res.status(500).json({ error: 'Failed to duplicate search' });
  }
});

// --------------------
// Results
// --------------------
app.get('/searches/:id/results', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

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
});

app.post('/searches/:id/results', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const marketplace = (req.body?.marketplace || '').toString().trim().toLowerCase();
    const items = req.body?.results;

    if (!marketplace) return res.status(400).json({ error: 'marketplace is required (e.g. "ebay")' });
    if (!Array.isArray(items)) return res.status(400).json({ error: 'results must be an array' });

    const { inserted } = await insertResults(pool, searchId, marketplace, items);
    res.json({ message: 'Results saved', inserted: inserted || 0 });
  } catch (err) {
    console.error('POST /searches/:id/results failed:', err);
    res.status(500).json({ error: 'Failed to save results' });
  }
});

// --------------------
// Refresh (eBay live)
// --------------------
app.post('/searches/:id/refresh', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const check = await pool.query('SELECT id, search_item, status FROM searches WHERE id = $1', [searchId]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'Search not found' });

    if ((check.rows[0].status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ error: 'Cannot refresh a deleted search' });
    }

    const q = (check.rows[0].search_item || '').trim();
    if (!q) return res.status(400).json({ error: 'Search has no search_item to query eBay with' });

    const token = await getEbayAppToken();

    const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '50');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(resp.status).json({ ok: false, ebayError: data });

    const summaries = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

    const normalized = summaries
      .map((it) => {
        const priceVal = it?.price?.value ?? null;
        const currency = it?.price?.currency ?? 'USD';

        return {
          external_id: it?.itemId || it?.legacyItemId || it?.itemWebUrl || null,
          title: it?.title || 'Untitled',
          price: priceVal,
          currency,
          listing_url: it?.itemWebUrl || null,
          image_url: it?.image?.imageUrl || null,
          location: it?.itemLocation?.city || it?.itemLocation?.country || null,
          condition: it?.condition || null,
          seller_username: it?.seller?.username || null,
          found_at: new Date().toISOString(),
        };
      })
      .filter((r) => r.external_id && r.listing_url);

    const { inserted } = await insertResults(pool, searchId, 'ebay', normalized);

    res.json({
      ok: true,
      marketplace: 'ebay',
      searchId,
      query: q,
      fetched: summaries.length,
      inserted: inserted || 0,
    });
  } catch (err) {
    console.error('POST /searches/:id/refresh failed:', err);
    res.status(500).json({ error: 'Failed to refresh search' });
  }
});

// --------------------
// Alerts feed + status patch
// --------------------
app.get('/searches/:id/alerts', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const limitNum = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const offsetNum = clampInt(req.query.offset, { min: 0, max: 1_000_000, fallback: 0 });

    const statusRaw = req.query.status;
    const statusParam = statusRaw === undefined || statusRaw === '' ? null : String(statusRaw);

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
    console.error('GET /searches/:id/alerts failed:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

app.patch('/api/alerts/:alert_id/status', async (req, res) => {
  try {
    const alertId = toInt(req.params.alert_id);
    if (alertId === null) return res.status(400).json({ error: 'Invalid alert id' });

    const statusRaw = req.body?.status;
    if (typeof statusRaw !== 'string') {
      return res.status(400).json({ error: 'status must be a string' });
    }

    let status = statusRaw.trim().toLowerCase();
    if (status === 'failed') status = 'error'; // accept "failed" as an alias
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
    console.error('PATCH /api/alerts/:alert_id/status failed:', err);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
});





// --------------------
// Notifications (email) MVP
// --------------------
app.post('/searches/:id/notifications/email', async (req, res) => {
  try {
    const searchId = toInt(req.params.id);
    if (searchId === null) return res.status(400).json({ error: 'Invalid search id' });

    const { email, enabled } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    await pool.query(
      `
      INSERT INTO notification_settings (search_id, channel, destination, is_enabled)
      VALUES ($1, 'email', $2, COALESCE($3, TRUE))
      ON CONFLICT (search_id, channel)
      DO UPDATE SET destination=EXCLUDED.destination, is_enabled=EXCLUDED.is_enabled
      `,
      [searchId, email, enabled]
    );

    res.json({ ok: true, searchId, channel: 'email', destination: email, enabled: enabled ?? true });
  } catch (err) {
    console.error('POST /searches/:id/notifications/email failed:', err);
    res.status(500).json({ error: 'Failed to save notification setting' });
  }
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`GoSnaggit server is running on port ${PORT}`);
});
