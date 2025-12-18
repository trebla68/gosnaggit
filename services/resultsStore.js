// services/resultsStore.js

/**
 * Insert many results for a search, skipping duplicates.
 * Uses UNIQUE(search_id, marketplace, external_id) to dedupe.
 * Also creates alert_events entries for newly inserted rows.
 */
async function insertResults(pool, searchId, marketplace, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { inserted: 0 };
  }

  const values = [];
  const placeholders = [];

  // Columns:
  // search_id, marketplace, external_id, title, price, currency, listing_url,
  // image_url, location, condition, seller_username, raw
  let i = 1;
  for (const item of items) {
    // Minimal validation (skip malformed rows quietly)
    if (!item?.external_id || !item?.title || !item?.listing_url) continue;

    placeholders.push(`(
      $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++},
      $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}
    )`);

    values.push(
      searchId,
      marketplace,
      String(item.external_id),
      String(item.title),
      item.price === undefined || item.price === null ? null : item.price,
      item.currency || null,
      String(item.listing_url),
      item.image_url || null,
      item.location || null,
      item.condition || null,
      item.seller_username || null,
      item.raw || null
    );
  }

  if (placeholders.length === 0) {
    return { inserted: 0 };
  }

  const sql = `
    INSERT INTO results (
      search_id, marketplace, external_id, title, price, currency, listing_url,
      image_url, location, condition, seller_username, raw
    )
    VALUES ${placeholders.join(",")}
    ON CONFLICT (search_id, marketplace, external_id) DO NOTHING
    RETURNING id, external_id
  `;

  const result = await pool.query(sql, values);

  // Create pending alert events for NEWLY inserted results only
  // (deduped forever by dedupe_key unique index)
  for (const row of result.rows) {
    const dedupeKey = `new_listing:${marketplace}:${row.external_id}`;

    await pool.query(
      `
      INSERT INTO alert_events (search_id, result_id, type, status, dedupe_key)
      VALUES ($1, $2, 'new_listing', 'pending', $3)
      ON CONFLICT (dedupe_key) DO NOTHING
      `,
      [searchId, row.id, dedupeKey]
    );
  }

  return { inserted: result.rowCount };
}

module.exports = { insertResults };
