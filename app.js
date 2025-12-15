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
// Update an existing search (Edit Search)
// ----------------------------------------------------
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
// Get results for a search (paginated) — DB-backed
app.get('/searches/:id/results', async (req, res) => {
  try {
    const searchId = parseInt(req.params.id, 10);
    if (Number.isNaN(searchId)) {
      return res.status(400).json({ error: 'Invalid search id' });
    }

    const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit || '6', 10) || 6, 1);
    const offset = (page - 1) * limit;

    // total count
    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM search_results WHERE search_id = $1',
      [searchId]
    );
    const totalResults = countResult.rows[0]?.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalResults / limit));

    if (totalResults === 0) {
      return res.json({
        results: [],
        page,
        total_pages: 1,
        total_results: 0,
        demo: true
      });
    }

    // page rows (newest first)
    const resultsResult = await pool.query(
      `
      SELECT
        id,
        title,
        price,
        source,
        location,
        condition,
        url,
        posted_at,
        found_at,
        created_at
      FROM search_results
      WHERE search_id = $1
      ORDER BY COALESCE(posted_at, found_at, created_at) DESC
      LIMIT $2 OFFSET $3
      `,
      [searchId, limit, offset]
    );

    return res.json({
      results: resultsResult.rows,
      page,
      total_pages: totalPages,
      total_results: totalResults
    });
  } catch (err) {
    console.error('GET /searches/:id/results error:', err);
    return res.status(500).json({ error: 'Failed to load results' });
  }
});




// ----------------------------------------------------
// Start the server
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`GoSnaggit server is running on port ${PORT}`);
});
