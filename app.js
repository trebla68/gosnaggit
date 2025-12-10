// app.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const pool = require('./db');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Optional simple test route
app.get('/test-rout-123', (req, res) => {
  res.json({
    message: 'Hello from THIS app.js',
    file: __filename,
  });
});

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

// ----------------------------------------------------
// Get all searches (used by searches.html)
// ----------------------------------------------------
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
// Update an existing search (Edit Search)
// ----------------------------------------------------
app.patch('/searches/:id', async (req, res) => {
  const { id } = req.params;
  const {
    search_item,
    location,
    category,
    max_price
  } = req.body;

  if (!search_item || search_item.trim() === '') {
    return res.status(400).json({ error: 'search_item is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE searches
       SET search_item = $1,
           location    = $2,
           category    = $3,
           max_price   = $4
       WHERE id = $5
       RETURNING *`,
      [search_item, location, category, max_price, id]
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
// Update (or toggle) the status of a search (active/paused)
// ----------------------------------------------------
app.patch('/searches/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // expected: 'active', 'paused', or 'completed'

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
// Delete a search by ID
// ----------------------------------------------------
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


// Enhanced mock results for a specific search, with pagination
app.get('/searches/:id/results', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 5;

  try {
    // Look up the search so we can tailor the mock results
    const searchResult = await pool.query(
      'SELECT * FROM searches WHERE id = $1',
      [id]
    );

    if (searchResult.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    const search = searchResult.rows[0];
    const item = search.search_item || 'Vintage item';
    const category = (search.category || '').toLowerCase();
    const basePrice = parseFloat(search.max_price) || 300;

    // Helper to make prices around the base price
    const around = (pctBelow, pctAbove) => {
      const min = basePrice * (1 - pctBelow);
      const max = basePrice * (1 + pctAbove);
      const value = min + Math.random() * (max - min);
      return Math.round(value * 100) / 100;
    };

    // Pick some sources based on category
    const sources = [
      'eBay',
      category.includes('auto') ? 'Bring a Trailer' : 'Etsy',
      category.includes('furniture') ? 'Facebook Marketplace' : 'Craigslist'
    ];

    const now = new Date();

    // Build a larger pool of mock results (e.g., 12 items)
    const fullResults = [];
    const conditions = ['Excellent', 'Good', 'Fair', 'Very good'];
    const baseTitles = [
      `${item} – Excellent condition`,
      `${item} – Good condition`,
      `${item} – Needs some work`
    ];

    for (let i = 0; i < 12; i++) {
      const cond = conditions[i % conditions.length];
      const source = sources[i % sources.length];
      const title = baseTitles[i % baseTitles.length].replace('condition', cond.toLowerCase() + ' condition');

      fullResults.push({
        title,
        source,
        price: around(0.3, 0.1),
        condition: cond,
        location: search.location || 'Online',
        posted_at: new Date(
          now.getTime() - (2 + i * 2) * 24 * 60 * 60 * 1000
        ).toISOString(),
        url: `https://example.com/listing/${i + 1}`,
        image_url: `https://via.placeholder.com/160x120?text=Listing+${i + 1}`
      });
    }

    const totalResults = fullResults.length;
    const totalPages = Math.ceil(totalResults / limit);

    // Clamp page to valid range
    const safePage = Math.min(Math.max(page, 1), totalPages || 1);
    const start = (safePage - 1) * limit;
    const pagedResults = fullResults.slice(start, start + limit);

    res.json({
      search_id: id,
      search_item: search.search_item,
      category: search.category,
      location: search.location,
      total_results: totalResults,
      page: safePage,
      limit,
      total_pages: totalPages,
      results: pagedResults
    });
  } catch (err) {
    console.error('Error getting mock results:', err);
    res.status(500).json({ error: 'Failed to get results' });
  }
});



// ----------------------------------------------------
// Start the server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`GoSnaggit server is running on port ${PORT}`);
});
