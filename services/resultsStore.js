// services/resultsStore.js

/**
 * Insert many results for a search, skipping duplicates.
 * Uses UNIQUE(search_id, marketplace, external_id) to dedupe.
 */
async function insertResults(pool, searchId, marketplace, items) {
    if (!Array.isArray(items) || items.length === 0) {
        return { inserted: 0 };
    }

    const values = [];
    const placeholders = [];

    // Build parameterized VALUES list
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
    RETURNING id
  `;

    const result = await pool.query(sql, values);
    return { inserted: result.rowCount };
}

module.exports = { insertResults };
