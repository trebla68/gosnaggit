// app.js

require('dotenv').config();

const express = require('express');
const path = require('path');

const pool = require('./db');
const { getEbayAppToken } = require('./services/ebayAuth');
const { insertResults } = require('./services/resultsStore');
const { createNewListingAlert } = require('./services/alerts');
const { sendEmail, buildAlertEmail } = require('./services/notifications');
const { enqueueRefreshJobForSearch } = require('./services/jobs');
const { dispatchPendingAlertsForSearch } = require('./services/dispatchAlerts');
const { setTierAndReschedule } = require('./services/schedule');   // ← add this line



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
    const { search_item, location, category, max_price, status } = req.body || {};

    if (!search_item || String(search_item).trim() === '') {
      return res.status(400).json({ error: 'search_item is required' });
    }

    const finalStatus = status ?? 'active';

    const result = await pool.query(
      `
      INSERT INTO searches (search_item, location, category, max_price, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        String(search_item).trim(),
        location ?? null,
        category ?? null,
        max_price ?? null,
        finalStatus
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





async function getSearches(req, res) {
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

app.patch('/api/searches/:id', async (req, res) => {
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
    console.error('PATCH /api/searches/:id failed:', err);
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

    const tier = req.body?.tier;
    if (!tier) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const updatedTier = await setTierAndReschedule(searchId, tier);
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

    const tier = req.body?.tier;
    if (!tier) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const updatedTier = await setTierAndReschedule(searchId, tier);
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

app.get('/searches/:id/results', getSearchResults);
app.get('/api/searches/:id/results', getSearchResults);

app.post('/searches/:id/results', postSearchResults);
app.post('/api/searches/:id/results', postSearchResults);

app.all('/searches/:id/results', methodNotAllowed(['GET', 'POST']));
app.all('/api/searches/:id/results', methodNotAllowed(['GET', 'POST']));


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

  // Dev: dispatch pending email alerts for a search
  // Example: GET /dev/searches/2/dispatch-alerts?limit=25
  app.get('/dev/searches/:id/dispatch-alerts', async (req, res) => {
    try {
      const searchId = parseInt(req.params.id, 10);
      if (Number.isNaN(searchId)) return res.status(400).json({ error: 'Invalid search id' });

      const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 25, 200));

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
        return res.status(400).json({
          ok: false,
          error: 'No enabled email notification setting found for this search',
          search_id: searchId,
        });
      }

      const toEmail = rows[0].destination;

      const result = await dispatchPendingAlertsForSearch({
        pool,
        searchId,
        toEmail,
        limit,
      });

      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error('GET /dev/searches/:id/dispatch-alerts failed:', err);

      // Dev-only endpoint: include details to avoid "can't paste from terminal" issues
      return res.status(500).json({
        ok: false,
        error: 'Failed to dispatch alerts',
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
    console.error('GET search alerts failed:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
}

app.get('/api/searches/:id/alerts', getSearchAlerts);
app.get('/searches/:id/alerts', getSearchAlerts);
app.all('/api/searches/:id/alerts', methodNotAllowed(['GET']));
app.all('/searches/:id/alerts', methodNotAllowed(['GET']));

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
// Start server (keep truly last)
// --------------------
app.listen(PORT, () => {
  console.log(`GoSnaggit server is running on http://localhost:${PORT}`);
});
