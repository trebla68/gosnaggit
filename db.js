const { Pool } = require('pg');
const dotenv = require('dotenv');

// Load variables from .env
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required by many cloud Postgres providers
  },
});

// Prevent worker crashes when Neon drops idle connections
pool.on('error', (err) => {
  console.error('[db] idle client error:', err && err.message ? err.message : err);
});

module.exports = pool;
