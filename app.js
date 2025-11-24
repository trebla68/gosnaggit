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
app.get('/searches', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM searches
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
  const { status } = req.body; // expected: 'active' or 'paused'

  if (!status || !['active', 'paused'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Use 'active' or 'paused'." });
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
app.delete('/searches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM searches WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json({
      message: 'Search deleted',
      deleted: result.rows[0],
    });
  } catch (err) {
    console.error('Error deleting search:', err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});

// ----------------------------------------------------
// Enhanced mock results for a specific search
// ----------------------------------------------------
app.get('/searches/:id/results', async (req, res) => {
  const { id } = req.params;

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

    const results = [
      {
        title: `${item} – Excellent condition`,
        source: sources[0],
        price: around(0.05, 0.02),
        condition: 'Excellent',
        location: search.location || 'Online',
        posted_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        url: 'https://example.com/listing/1',
        image_url: 'https://via.placeholder.com/160x120?text=Listing+1'
      },
      {
        title: `${item} – Good condition`,
        source: sources[1],
        price: around(0.15, 0.0),
        condition: 'Good',
        location: search.location || 'Online',
        posted_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        url: 'https://example.com/listing/2',
        image_url: 'https://via.placeholder.com/160x120?text=Listing+2'
      },
      {
        title: `${item} – Needs some work`,
        source: sources[2],
        price: around(0.3, -0.05),
        condition: 'Fair',
        location: search.location || 'Online',
        posted_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        url: 'https://example.com/listing/3',
        image_url: 'https://via.placeholder.com/160x120?text=Listing+3'
      }
    ];

    res.json({
      search_id: id,
      search_item: search.search_item,
      category: search.category,
      location: search.location,
      total_results: results.length,
      page: 1,
      limit: results.length,
      results
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
