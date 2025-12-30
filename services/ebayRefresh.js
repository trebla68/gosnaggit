// services/ebayRefresh.js
const pool = require('../db');
const { searchEbayListings } = require('./ebaySearch');

function makeDedupeKey({ search_id, marketplace, external_id }) {
  return `new_listing:${marketplace}:v1|search=${search_id}|item=${external_id}|0`;
}

async function getOrCreateResult({ search_id, listing }) {
  // Upsert by (marketplace, external_id)
  // Always returns the row id (inserted or existing).
  const sql = `
    INSERT INTO results
      (search_id, marketplace, external_id, title, price, currency, listing_url, found_at, raw)
    VALUES
      ($1, 'ebay', $2, $3, $4, $5, $6, NOW(), $7)
    ON CONFLICT (marketplace, external_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      listing_url = EXCLUDED.listing_url,
      raw = EXCLUDED.raw
    RETURNING id
  `;

  const params = [
    search_id,
    listing.external_id,
    listing.title,
    listing.price ?? null,
    listing.currency ?? null,
    listing.listing_url,
    listing.raw ?? null,
  ];

  const { rows } = await pool.query(sql, params);
  return rows[0].id;
}

async function insertAlertEventIfNew({ search_id, listing }) {
  const result_id = await getOrCreateResult({ search_id, listing });
  const dedupe_key = makeDedupeKey({
    search_id,
    marketplace: 'ebay',
    external_id: listing.external_id,
  });

  const sql = `
    INSERT INTO alert_events
      (search_id, result_id, type, status, dedupe_key, title, price, currency, listing_url, marketplace, external_id)
    VALUES
      ($1, $2, 'new_listing', 'pending', $3, $4, $5, $6, $7, 'ebay', $8)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;

  const params = [
    search_id,
    result_id,
    dedupe_key,
    listing.title,
    listing.price ?? null,
    listing.currency ?? null,
    listing.listing_url,
    listing.external_id,
  ];

  const { rows } = await pool.query(sql, params);
  return rows.length ? rows[0].id : null;
}

async function refreshSearchFromEbay(searchRow) {
  const listings = await searchEbayListings({
    q: searchRow.query,
    maxPrice: searchRow.max_price,
    category: searchRow.category,
    location: searchRow.location,
  });

  let inserted = 0;

  for (const listing of listings) {
    const id = await insertAlertEventIfNew({ search_id: searchRow.id, listing });
    if (id) inserted += 1;
  }

  console.log(`[ebayRefresh] search ${searchRow.id}: inserted ${inserted} new alert(s)`);
  return { fetched: listings.length, inserted };
}

module.exports = { refreshSearchFromEbay };