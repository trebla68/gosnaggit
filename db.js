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

module.exports = pool;
