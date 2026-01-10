// services/resultsStore.js
const pool = require('../db');

/**
 * Upsert ONE result row and classify:
 * - created: inserted new row
 * - updated: existing row changed
 * - skipped: conflict occurred but values were identical (no-op update prevented)
 *
 * Uniqueness in Neon is: (search_id, marketplace, external_id)
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
  const sql = `
    WITH upserted AS (
      INSERT INTO results
        (search_id, marketplace, external_id, title, price, currency, listing_url,
         image_url, location, condition, seller_username, found_at, raw)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11, COALESCE($12, NOW()), $13)
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
        found_at        = EXCLUDED.found_at,
        raw             = EXCLUDED.raw
      -- Prevent no-op updates so we can count "skipped"
      WHERE
        results.title           IS DISTINCT FROM EXCLUDED.title OR
        results.price           IS DISTINCT FROM EXCLUDED.price OR
        results.currency        IS DISTINCT FROM EXCLUDED.currency OR
        results.listing_url     IS DISTINCT FROM EXCLUDED.listing_url OR
        results.image_url       IS DISTINCT FROM EXCLUDED.image_url OR
        results.location        IS DISTINCT FROM EXCLUDED.location OR
        results.condition       IS DISTINCT FROM EXCLUDED.condition OR
        results.seller_username IS DISTINCT FROM EXCLUDED.seller_username OR
        results.found_at        IS DISTINCT FROM EXCLUDED.found_at OR
        results.raw             IS DISTINCT FROM EXCLUDED.raw
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
  ];

  const { rows } = await pool.query(sql, params);

  const row = rows[0];
  const insertedFlag = row?.inserted;

  let action = 'skipped';
  if (insertedFlag === true) action = 'created';
  else if (insertedFlag === false) action = 'updated';
  // insertedFlag === null => skipped (no-op update prevented)

  return { id: row?.id, action };
}

/**
 * Insert/Upsert MANY results.
 *
 * Back-compat: returns { inserted } where inserted = created + updated
 * (i.e., "insertedOrUpdated") as your app expects.
 *
 * Also returns richer metrics:
 * { created, updated, skipped, total_incoming, processed }
 */
async function insertResults(dbPool, searchId, marketplace, items) {
  // NOTE: dbPool is accepted for API compatibility, but this module currently uses global pool.
  // If you later pass a transaction client, we can refactor to use dbPool for all queries.
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

    // Ignore invalid rows (not counted)
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

  return {
    inserted,        // back-compat
    created,
    updated,
    skipped,
    total_incoming,
    processed,
  };
}

module.exports = { upsertResultWithMetrics, insertResults };
