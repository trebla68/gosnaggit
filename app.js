const express = require('express');
const app = express();
const PORT = 3000;

const pool = require('./db'); // <-- this pulls in your Neon database connection

// Simple home route
app.get('/', (req, res) => {
  res.send('Hello from GoSnaggit!');
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

app.listen(PORT, () => {
  console.log(`GoSnaggit server running at http://localhost:${PORT}`);
});
