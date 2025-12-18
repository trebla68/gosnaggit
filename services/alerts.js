// services/alerts.js
const pool = require('../db');

async function createNewListingAlert({ searchId, marketplace, itemId }) {
    const dedupeKey = `new_listing:${marketplace}:v1|search=${searchId}|item=${itemId}`;

    // status: pending (your DB seems to store status as numeric; adjust if it's text)
    // If your status is TEXT: use 'pending'
    // If your status is INT: use 2 (based on your table output)
    const statusValue = 2;

    const sql = `
    INSERT INTO alert_events (search_id, status, dedupe_key)
    VALUES ($1, $2, $3)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id;
  `;

    const result = await pool.query(sql, [searchId, statusValue, dedupeKey]);
    return { inserted: result.rowCount === 1, dedupeKey };
}

module.exports = { createNewListingAlert };
