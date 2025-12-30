// services/resultsStore.js
const pool = require('../db');

/**
 * Upsert ONE result row.
 * Uniqueness in Neon is: (search_id, marketplace, external_id)
 */
async function upsertResult({
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
  found_at,
  raw,
}) {
  const sql = `
    INSERT INTO results
      (search_id, marketplace, external_id, title, price, currency, listing_url,
       image_url, location, condition, seller_username, found_at, raw)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11, COALESCE($12, NOW()), $13)
    ON CONFLICT (search_id, marketplace, external_id)
    DO UPDATE SET
      title          = EXCLUDED.title,
      price          = EXCLUDED.price,
      currency       = EXCLUDED.currency,
      listing_url    = EXCLUDED.listing_url,
      image_url      = EXCLUDED.image_url,
      location       = EXCLUDED.location,
      condition      = EXCLUDED.condition,
      seller_username= EXCLUDED.seller_username,
      found_at       = EXCLUDED.found_at,
      raw            = EXCLUDED.raw
    RETURNING id
  `;

  const params = [
    search_id,
    marketplace,
    external_id,
    title ?? null,
    price ?? null,
    currency ?? null,
    listing_url ?? null,
    image_url ?? null,
    location ?? null,
    condition ?? null,
    seller_username ?? null,
    found_at ?? null,
    raw ?? null,
  ];

  const { rows } = await pool.query(sql, params);
  return rows[0].id;
}

/**
 * Insert/Upsert MANY results. Returns { inserted } for UI friendliness.
 * We treat upserts as "insertedOrUpdated" but keep the field name `inserted`
 * because your app.js expects it.
 */
async function insertResults(dbPool, searchId, marketplace, items) {
  const p = dbPool || pool;
  const m = String(marketplace || '').trim().toLowerCase();
  if (!m) throw new Error('insertResults: marketplace is required');
  if (!Array.isArray(items)) throw new Error('insertResults: items must be an array');

  let inserted = 0;

  for (const it of items) {
    const external_id = it?.external_id ?? it?.externalId ?? it?.itemId ?? null;
    const listing_url = it?.listing_url ?? it?.listingUrl ?? it?.url ?? null;
    const title = it?.title ?? null;

    if (!external_id || !listing_url) continue;

    await upsertResult({
      search_id: searchId,
      marketplace: m,
      external_id,
      title,
      price: it?.price ?? null,
      currency: it?.currency ?? null,
      listing_url,
      image_url: it?.image_url ?? null,
      location: it?.location ?? null,
      condition: it?.condition ?? null,
      seller_username: it?.seller_username ?? null,
      found_at: it?.found_at ?? null,
      raw: it?.raw ?? null,
    });

    inserted += 1;
  }

  return { inserted };
}

module.exports = { upsertResult, insertResults };
