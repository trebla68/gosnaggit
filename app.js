// app.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const pool = require('./db');
const { getEbayAppToken } = require("./services/ebayAuth");
const { insertResults } = require('./services/resultsStore');

const fetch = global.fetch;
if (!fetch) throw new Error("Node 18+ required (fetch not available).");



// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.NODE_ENV !== 'production') {
  console.log('LOADED app.js:', __filename);
}


// ----------------------------------------------------
// eBay token route (DEV ONLY)
// ----------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  app.get("/api/ebay/token", async (req, res) => {
    try {
      const token = await getEbayAppToken();
      res.json({ ok: true, tokenStartsWith: token.slice(0, 20) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

// ----------------------------------------------------
// eBay search route (keep in all environments)
// ----------------------------------------------------
app.get("/api/ebay/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    if (!q) {
      return res.status(400).json({ ok: false, error: "Missing required query param: q" });
    }

    const token = await getEbayAppToken();

    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, ebayError: data });
    }

    // Return the raw eBay payload for now (we’ll “normalize” later)
    res.json({ ok: true, ebay: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DEV ONLY: Seed mock results for a given search_id (for UI/pagination testing)
if (process.env.NODE_ENV !== 'production') {
  app.post('/dev/seed-results', async (req, res) => {
    try {
      const searchId = parseInt(req.query.search_id || req.body.search_id, 10);
      if (Number.isNaN(searchId)) {
        return res.status(400).json({ error: 'Missing or invalid search_id' });
      }

      const countRaw = req.query.count ?? req.body.count ?? 12;
      const count = Math.max(1, Math.min(parseInt(countRaw, 10) || 12, 200));

      const marketplaces = ['ebay', 'etsy', 'facebook', 'craigslist'];
      const conditions = ['New', 'Used', 'Open box', 'Refurbished'];
      const locations = ['Los Angeles', 'New York', 'Chicago', 'Online', 'San Francisco'];

      // ----------------------------------------------------
      // Seed results via insertResults() so alerts are created
      // ----------------------------------------------------
      const items = [];

      for (let i = 0; i < count; i++) {
        const marketplace = marketplaces[i % marketplaces.length];
        const condition = conditions[i % conditions.length];
        const location = locations[i % locations.length];

        const price = (Math.random() * 900 + 50).toFixed(2);
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
          price: Number(price),
          currency,
          listing_url: listingUrl,
          image_url: imageUrl,
          location,
          condition,
          seller_username: seller,
          found_at: foundAt.toISOString(), // include explicit found_at
          raw: {
            seeded: true,
            searchId,
            i,
            found_at: foundAt.toISOString()
          }
        });
      }

      // Group by marketplace (insertResults accepts one marketplace at a time)
      const grouped = items.reduce((acc, it) => {
        (acc[it.marketplace] ||= []).push(it);
        return acc;
      }, {});

      let totalInserted = 0;

      for (const [marketplace, groupItems] of Object.entries(grouped)) {
        const cleaned = groupItems.map(({ marketplace: _m, ...rest }) => rest);
        const out = await insertResults(pool, searchId, marketplace, cleaned);
        totalInserted += out.inserted;
      }

      res.json({
        ok: true,
        inserted: totalInserted,
        marketplaces: Object.keys(grouped),
        hint: `Now try GET /searches/${searchId}/results and GET /searches/${searchId}/alerts`,
      });
    } catch (err) {
      console.error('POST /dev/seed-results failed:', err);
      res.status(500).json({ error: 'Failed to seed results' });
    }
  });
}





// ----------------------------------------------------
// Create a new search (from search.html form or Postman)
// ----------------------------------------------------
app.post('/searches', async (req, res) => {
      const {
        search_item,
        location,
        category,
        max_price,
        status
      } = req.body;

      if (!search_item || search_item.trim() === '') {
        return res.status(400).json({ error: 'search_item is required' });
      }

      const finalStatus = status && status.trim() !== '' ? status : 'active';

      try {
        const result = await pool.query(
          `INSERT INTO searches (search_item, location, category, max_price, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
          [search_item, location, category, max_price, finalStatus]
        );

        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error('Error creating search:', err);
        res.status(500).json({ error: 'Failed to create search' });
      }
    });

    // Insert results for a search (testing + later used by marketplace integrations)
    app.post('/searches/:id/results', async (req, res) => {
      try {
        const searchId = parseInt(req.params.id, 10);
        if (Number.isNaN(searchId)) {
          return res.status(400).json({ error: 'Invalid search id' });
        }

        const marketplace = (req.body.marketplace || '').trim().toLowerCase();
        const items = req.body.results;

        if (!marketplace) {
          return res.status(400).json({ error: 'marketplace is required (e.g. "ebay")' });
        }
        if (!Array.isArray(items)) {
          return res.status(400).json({ error: 'results must be an array' });
        }

        const { inserted } = await insertResults(pool, searchId, marketplace, items);

        res.json({ message: 'Results saved', inserted });
      } catch (err) {
        console.error('POST /searches/:id/results failed:', err);
        res.status(500).json({ error: 'Failed to save results' });
      }
    });

    // Trigger a marketplace refresh for a search (eBay live)
    app.post('/searches/:id/refresh', async (req, res) => {
      try {
        const searchId = parseInt(req.params.id, 10);
        if (Number.isNaN(searchId)) {
          return res.status(400).json({ error: 'Invalid search id' });
        }

        // 1) Load the saved search
        const check = await pool.query(
          'SELECT id, search_item, status FROM searches WHERE id = $1',
          [searchId]
        );

        if (check.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        if ((check.rows[0].status || '').toLowerCase() === 'deleted') {
          return res.status(400).json({ error: 'Cannot refresh a deleted search' });
        }

        const q = (check.rows[0].search_item || '').trim();
        if (!q) {
          return res.status(400).json({ error: 'Search has no search_item to query eBay with' });
        }

        // 2) Call eBay Browse search
        const token = await getEbayAppToken();

        const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "50"); // max 200, but 50 is a good start

        const resp = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          },
        });

        const data = await resp.json();
        if (!resp.ok) {
          return res.status(resp.status).json({ ok: false, ebayError: data });
        }

        const summaries = Array.isArray(data.itemSummaries) ? data.itemSummaries : [];

        // 3) Normalize to your insertResults() expected shape
        // NOTE: match fields your insertResults/resultsStore expects
        const normalized = summaries.map((it) => {
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
            found_at: new Date().toISOString()
          };
        }).filter(r => r.external_id && r.listing_url);

        // 4) Store in DB
        const marketplace = 'ebay';
        const { inserted } = await insertResults(pool, searchId, marketplace, normalized);

        // 5) Respond
        res.json({
          ok: true,
          marketplace,
          searchId,
          query: q,
          fetched: summaries.length,
          inserted
        });
      } catch (err) {
        console.error('POST /searches/:id/refresh failed:', err);
        res.status(500).json({ error: 'Failed to refresh search' });
      }
    });


    // ----------------------------------------------------
    // Get all searches (used by searches.html)
    // ----------------------------------------------------
    app.get('/searches', async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT *
       FROM searches
       WHERE status IS NULL OR status <> 'deleted'
       ORDER BY created_at DESC`
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Error fetching searches:', err);
        res.status(500).json({ error: 'Failed to fetch searches' });
      }
    });

    // ----------------------------------------------------
    // Get deleted searches (recycle bin / restore view)
    // ----------------------------------------------------
    app.get('/searches/deleted', async (req, res) => {
      try {
        const result = await pool.query(
          `SELECT *
       FROM searches
       WHERE status = 'deleted'
       ORDER BY created_at DESC`
        );

        res.json(result.rows);
      } catch (err) {
        console.error('Error fetching deleted searches:', err);
        res.status(500).json({ error: 'Failed to fetch deleted searches' });
      }
    });

    // ----------------------------------------------------
    // Get a single search by ID (used by edit-search.html)
    // ----------------------------------------------------
    app.get('/searches/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await pool.query(
          'SELECT * FROM searches WHERE id = $1',
          [id]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        res.json(result.rows[0]);
      } catch (err) {
        console.error('Error fetching search by ID:', err);
        res.status(500).json({ error: 'Failed to fetch search' });
      }
    });

    // ----------------------------------------------------
    // Update an existing search (full edit: fields + optional status)
    // ----------------------------------------------------
    app.patch('/searches/:id', async (req, res) => {
      const { id } = req.params;
      const {
        search_item,
        location,
        category,
        max_price,
        status
      } = req.body;

      if (!search_item || search_item.trim() === '') {
        return res.status(400).json({ error: 'search_item is required' });
      }

      const allowedStatuses = ['active', 'paused', 'completed', 'cancelled', 'deleted'];
      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'."
        });
      }

      try {
        const result = await pool.query(
          `UPDATE searches
       SET search_item = $1,
           location    = $2,
           category    = $3,
           max_price   = $4,
           status      = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
          [
            search_item,
            location,
            category,
            max_price,
            status || null,
            id
          ]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        res.json({
          message: 'Search updated',
          search: result.rows[0],
        });
      } catch (err) {
        console.error('Error updating search:', err);
        res.status(500).json({ error: 'Failed to update search' });
      }
    });

    // ----------------------------------------------------
    // Update the status of a search (active/paused/etc.)
    // ----------------------------------------------------
    app.patch('/searches/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['active', 'paused', 'completed', 'cancelled', 'deleted'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Use 'active', 'paused', 'completed', 'cancelled', or 'deleted'." });
      }

      try {
        const result = await pool.query(
          'UPDATE searches SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        res.json({
          message: 'Status updated',
          search: result.rows[0],
        });
      } catch (err) {
        console.error('Error updating search status:', err);
        res.status(500).json({ error: 'Failed to update status' });
      }
    });

    // ----------------------------------------------------
    // Delete a search by ID (soft delete: mark as 'deleted')
    // ----------------------------------------------------
    app.delete('/searches/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await pool.query(
          `UPDATE searches
       SET status = 'deleted'
       WHERE id = $1
       RETURNING *`,
          [id]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        res.json({
          message: 'Search soft-deleted (status set to "deleted")',
          search: result.rows[0],
        });
      } catch (err) {
        console.error('Error soft-deleting search:', err);
        res.status(500).json({ error: 'Failed to delete search' });
      }
    });

    // ----------------------------------------------------
    // Duplicate a search by ID
    // ----------------------------------------------------
    app.post('/searches/:id/duplicate', async (req, res) => {
      const { id } = req.params;

      try {
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

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Search not found' });
        }

        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error('Error duplicating search:', err);
        res.status(500).json({ error: 'Failed to duplicate search' });
      }
    });

    // Get stored marketplace results for a specific search (latest first)
    app.get('/searches/:id/results', async (req, res) => {
      try {
        const searchId = parseInt(req.params.id, 10);
        if (Number.isNaN(searchId)) {
          return res.status(400).json({ error: 'Invalid search id' });
        }

        const { limit = 50, offset = 0 } = req.query;
        const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
        const offsetNum = parseInt(offset, 10) || 0;

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
// Get alert feed for a search (pending first, newest first)
app.get('/searches/:id/alerts', async (req, res) => {
  try {
    const searchId = parseInt(req.params.id, 10);
    if (Number.isNaN(searchId)) {
      return res.status(400).json({ error: 'Invalid search id' });
    }

    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const offsetNum = parseInt(offset, 10) || 0;

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
      JOIN results r ON r.id = ae.result_id
      WHERE ae.search_id = $1
        AND ($2::text IS NULL OR ae.status = $2)
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $3 OFFSET $4
    `;

    const statusParam = status === '' ? null : status;
    const { rows } = await pool.query(sql, [searchId, statusParam, limitNum, offsetNum]);

    res.json(rows);
  } catch (err) {
    console.error('GET /searches/:id/alerts failed:', err);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});
// Mark an alert as sent/errored (MVP)
app.patch('/alerts/:alert_id/status', async (req, res) => {
  try {
    const alertId = parseInt(req.params.alert_id, 10);
    if (Number.isNaN(alertId)) {
      return res.status(400).json({ error: 'Invalid alert_id' });
    }

    const { status } = req.body;
    const allowed = ['pending', 'sent', 'error', 'dismissed'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Use: ${allowed.join(', ')}` });
    }

    const { rows } = await pool.query(
      `
      UPDATE alert_events
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id AS alert_id, search_id, status, created_at, updated_at
      `,
      [status, alertId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ ok: true, alert: rows[0] });
  } catch (err) {
    console.error('PATCH /alerts/:alert_id/status failed:', err);
    res.status(500).json({ error: 'Failed to update alert status' });
  }
});

    // Save / update email notification settings for a search (MVP)
    app.post('/searches/:id/notifications/email', async (req, res) => {
      try {
        const searchId = parseInt(req.params.id, 10);
        if (Number.isNaN(searchId)) {
          return res.status(400).json({ error: 'Invalid search id' });
        }

        const { email, enabled } = req.body;
        if (!email) {
          return res.status(400).json({ error: 'email is required' });
        }

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
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save notification setting' });
      }
    });


    // ----------------------------------------------------
    // Start the server
    // ----------------------------------------------------
    app.listen(PORT, () => {
      console.log(`GoSnaggit server is running on port ${PORT}`);
    });
