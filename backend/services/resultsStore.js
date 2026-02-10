// services/resultsStore.js
const pool = require('../db');

function parseMoneyToNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;

  const s = String(v).trim();
  if (!s) return null;

  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Upsert ONE result row and classify:
 * - created: inserted new row
 * - updated: existing row changed
 * - skipped: conflict occurred but values were identical (no-op update prevented)
 *
 * Uniqueness: (search_id, marketplace, external_id)
 */
async function upsertResultWithMetrics({
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
  const priceNum = parseMoneyToNum(price);
  const shippingNum = null;    // MVP: not wired yet
  const totalPrice = priceNum; // MVP: equals item price

  const sql = `
    WITH upserted AS (
      INSERT INTO results
        (search_id, marketplace, external_id, title, price, currency, listing_url,
         image_url, location, condition, seller_username, found_at, raw,
         price_num, shipping_num, total_price)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11, COALESCE($12, NOW()), $13,
         $14,$15,$16)
      ON CONFLICT (search_id, marketplace, external_id)
      DO UPDATE SET
        title           = EXCLUDED.title,
        price           = EXCLUDED.price,
        currency        = EXCLUDED.currency,
        listing_url     = EXCLUDED.listing_url,
        image_url       = EXCLUDED.image_url,
        location        = EXCLUDED.location,
        condition       = EXCLUDED.condition,
        seller_username = EXCLUDED.seller_username,
        price_num       = EXCLUDED.price_num,
        shipping_num    = EXCLUDED.shipping_num,
        total_price     = EXCLUDED.total_price
      WHERE
        results.title           IS DISTINCT FROM EXCLUDED.title OR
        results.price           IS DISTINCT FROM EXCLUDED.price OR
        results.currency        IS DISTINCT FROM EXCLUDED.currency OR
        results.listing_url     IS DISTINCT FROM EXCLUDED.listing_url OR
        results.image_url       IS DISTINCT FROM EXCLUDED.image_url OR
        results.location        IS DISTINCT FROM EXCLUDED.location OR
        results.condition       IS DISTINCT FROM EXCLUDED.condition OR
        results.seller_username IS DISTINCT FROM EXCLUDED.seller_username OR
        results.price_num       IS DISTINCT FROM EXCLUDED.price_num OR
        results.shipping_num    IS DISTINCT FROM EXCLUDED.shipping_num OR
        results.total_price     IS DISTINCT FROM EXCLUDED.total_price
      RETURNING
        id,
        (xmax = 0) AS inserted
    ),
    existing AS (
      SELECT id
      FROM results
      WHERE search_id = $1 AND marketplace = $2 AND external_id = $3
      LIMIT 1
    )
    SELECT
      COALESCE(u.id, e.id) AS id,
      u.inserted           AS inserted
    FROM existing e
    LEFT JOIN upserted u ON TRUE
    LIMIT 1
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
    priceNum,
    shippingNum,
    totalPrice,
  ];

  const { rows } = await pool.query(sql, params);
  const row = rows[0];

  const insertedFlag = row?.inserted; // true = inserted, false = updated, null/undefined = skipped
  let action = 'skipped';
  if (insertedFlag === true) action = 'created';
  else if (insertedFlag === false) action = 'updated';

  return { id: row?.id, action };
}

/**
 * Insert/Upsert MANY results.
 * Back-compat: returns { inserted } where inserted = created + updated
 */
async function insertResults(dbPool, searchId, marketplace, items) {
  // dbPool kept for compatibility; module uses global pool
  const m = String(marketplace || '').trim().toLowerCase();
  if (!m) throw new Error('insertResults: marketplace is required');
  if (!Array.isArray(items)) throw new Error('insertResults: items must be an array');

  const total_incoming = items.length;

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let processed = 0;

  for (const it of items) {
    const external_id = it?.external_id ?? it?.externalId ?? it?.itemId ?? null;
    const listing_url = it?.listing_url ?? it?.listingUrl ?? it?.url ?? null;
    const title = it?.title ?? null;

    if (!external_id || !listing_url) continue;

    const { action } = await upsertResultWithMetrics({
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

    processed += 1;

    if (action === 'created') created += 1;
    else if (action === 'updated') updated += 1;
    else skipped += 1;
  }

  const inserted = created + updated;

  return { inserted, created, updated, skipped, total_incoming, processed };
}

module.exports = { upsertResultWithMetrics, insertResults };
