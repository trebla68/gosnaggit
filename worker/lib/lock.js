// worker/lib/lock.js
// Postgres advisory lock helper (safe if you ever run >1 worker)

const crypto = require('crypto');

/**
 * Create a deterministic bigint key from a string, using first 8 bytes of SHA-256.
 * This is stable across runs.
 */
function lockKeyFromString(name) {
    const buf = crypto.createHash('sha256').update(name).digest();
    // first 8 bytes -> BigInt
    return buf.readBigInt64BE(0);
}

/**
 * Try to acquire a lock. Returns true if lock acquired, false otherwise.
 */
async function tryLock(pool, name) {
    const key = lockKeyFromString(name);
    const { rows } = await pool.query('SELECT pg_try_advisory_lock($1) AS locked', [key.toString()]);
    return Boolean(rows?.[0]?.locked);
}

/**
 * Release a lock (best-effort). Returns true if released.
 */
async function unlock(pool, name) {
    const key = lockKeyFromString(name);
    const { rows } = await pool.query('SELECT pg_advisory_unlock($1) AS unlocked', [key.toString()]);
    return Boolean(rows?.[0]?.unlocked);
}

module.exports = { tryLock, unlock };
