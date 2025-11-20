const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

const pool = require('./db');

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Simple home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test route to check database connection
app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`Database time: ${result.rows[0].now}`);
  } catch (err) {
    console.error('DB test error:', err);
    res.status(500).send('Database test failed');
  }
});

// Create a new search
app.post('/searches', async (req, res) => {
  try {
    const { search_item, location, category, max_price, status } = req.body;

    if (!search_item) {
      return res.status(400).json({ error: 'search_item is required' });
    }

    const result = await pool.query(
      `INSERT INTO searches (search_item, location, category, max_price, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, search_item, location, category, max_price, status, created_at`,
      [
        search_item,
        location || null,
        category || null,
        max_price || null,
        status || 'active'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create search error:', err);
    res.status(500).json({ error: 'Failed to create search' });
  }
});


// TEMP DEBUG: super simple /searches to see what the DB actually returns
app.get('/searches', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, search_item, status, created_at
       FROM searches
       ORDER BY created_at DESC
       LIMIT 5`
    );

    console.log('DEBUG /searches rows from DB:', result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error('DEBUG /searches error:', err);
    res.status(500).json({ error: 'Debug failed' });
  }
});




// Get a single search by ID
app.get('/searches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, search_item, location, category, max_price, created_at FROM searches WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get single search error:', err);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Delete a search by ID
app.delete('/searches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM searches WHERE id = $1 RETURNING id, search_item, location, category, max_price, created_at',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json({
      message: 'Search deleted',
      deleted: result.rows[0]
    });
  } catch (err) {
    console.error('Delete search error:', err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});
// Update a search by ID
app.put('/searches/:id', async (req, res) => {
  const { id } = req.params;
  const { search_item, location, category, max_price } = req.body;

  try {
    const result = await pool.query(
      `UPDATE searches
       SET search_item = COALESCE($1, search_item),
           location = COALESCE($2, location),
           category = COALESCE($3, category),
           max_price = COALESCE($4, max_price)
       WHERE id = $5
       RETURNING id, search_item, location, category, max_price, created_at`,
      [search_item, location, category, max_price, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json({
      message: 'Search updated',
      updated: result.rows[0]
    });
  } catch (err) {
    console.error('Update search error:', err);
    res.status(500).json({ error: 'Failed to update search' });
  }
});
// Get results for a specific search (with simple pagination)
app.get('/searches/:id/results', async (req, res) => {
  const searchId = req.params.id;

  // Read pagination from query string, with defaults
  const limit = parseInt(req.query.limit, 10) || 20;
  const page = parseInt(req.query.page, 10) || 1;
  const offset = (page - 1) * limit;

  try {
    const resultsQuery = `
      SELECT id, title, price, url, source, created_at
      FROM search_results
      WHERE search_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM search_results
      WHERE search_id = $1
    `;

    const [resultsResult, countResult] = await Promise.all([
      pool.query(resultsQuery, [searchId, limit, offset]),
      pool.query(countQuery, [searchId]),
    ]);

    const total = parseInt(countResult.rows[0].total, 10) || 0;

    res.json({
      search_id: Number(searchId),
      total_results: total,
      page,
      limit,
      results: resultsResult.rows,
    });
  } catch (err) {
    console.error('Error fetching search results', err);
    res.status(500).json({ error: 'Failed to fetch search results' });
  }
});

// --- Mock "search engine" helpers ---

// Generate some fake results for a given search row
function generateMockResultsForSearch(search) {
  const baseTitle = search.search_item || 'Unknown item';

  return [
    {
      title: `${baseTitle} - Good condition`,
      source: 'mock',
      price: search.max_price ? Number(search.max_price) * 0.8 : 100,
      url: 'https://example.com/listing/1'
    },
    {
      title: `${baseTitle} - Excellent condition`,
      source: 'mock',
      price: search.max_price ? Number(search.max_price) * 0.95 : 150,
      url: 'https://example.com/listing/2'
    }
  ];
}

// Core engine logic: run over all saved searches and insert mock results
async function runMockSearches() {
  const searchesResult = await pool.query(
    'SELECT id, search_item, location, category, max_price FROM searches'
  );
  const searches = searchesResult.rows;

  if (searches.length === 0) {
    return {
      message: 'No searches to run.',
      total_searches: 0,
      total_results_attempted: 0,
      total_results_created: 0
    };
  }

  let totalResultsCreated = 0;

  for (const search of searches) {
    const mockResults = generateMockResultsForSearch(search);

    for (const r of mockResults) {
      try {
        await pool.query(
          `INSERT INTO search_results (search_id, title, source, price, url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (search_id, title, source, url) DO NOTHING`,
          [search.id, r.title, r.source, r.price, r.url]
        );
        totalResultsCreated += 1;
      } catch (insertErr) {
        console.error('Error inserting mock result:', insertErr);
      }
    }
  }

  return {
    message: 'Mock search engine run complete.',
    total_searches: searches.length,
    total_results_attempted: searches.length * 2,
    total_results_created: totalResultsCreated
  };
}

// Route: manual trigger via Postman
app.post('/run-searches-mock', async (req, res) => {
  try {
    const summary = await runMockSearches();
    res.json(summary);
  } catch (err) {
    console.error('Error running mock searches:', err);
    res.status(500).json({ error: 'Failed to run mock search engine' });
  }
});

// Simple scheduler: run the mock engine every 10 minutes
setInterval(async () => {
  try {
    const summary = await runMockSearches();
    console.log(
      '[Mock engine] Ran at',
      new Date().toISOString(),
      'Summary:',
      summary
    );
  } catch (err) {
    console.error('Scheduled mock engine run failed:', err);
  }
}, 10 * 60 * 1000); // 10 minutes in milliseconds

  
// Debug route: get all search results (for now)
app.get('/results', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, search_id, title, source, price, url, created_at
       FROM search_results
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get results error:', err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

app.get('/test-route-123', (req, res) => {
  res.json({
    message: 'Hello from THIS app.js',
    file: __filename
  });
});

app.listen(PORT, () => {
  console.log(`GoSnaggit server running at http://localhost:${PORT}`);
});
