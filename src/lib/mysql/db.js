import mysql from 'mysql2/promise';

/**
 * MySQL connection pool.
 * Reused across requests in the same Next.js process.
 */
const pool = mysql.createPool({
  host:            process.env.MYSQL_HOST     || 'localhost',
  port:            parseInt(process.env.MYSQL_PORT || '3306'),
  database:        process.env.MYSQL_DATABASE || 'rk_clinic',
  user:            process.env.MYSQL_USER     || 'root',
  password:        process.env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
  maxIdle:         parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10', 10),
  idleTimeout:     60_000,          // release idle connections after 60s
  queueLimit:      0,
  // Timezone is deliberately NOT pinned to '+00:00'. Doing so made mysql2 treat
  // every stored DATETIME as UTC while MySQL's own NOW()/CURDATE() stayed on the
  // server's local zone, so the two disagreed: server-side aggregates counted a
  // row as "today" that the browser then rendered on the following day. The lab
  // day has to match the clinic's local day, so JS and SQL both use local time.
  connectTimeout:  15_000,          // fail fast if the DB is unreachable
  enableKeepAlive: true,            // keep pooled sockets healthy for 24/7 use
  keepAliveInitialDelay: 10_000,
});

/**
 * Locate the `?` placeholders that sit in a LIMIT or OFFSET clause.
 *
 * MySQL 9 rejects integer-typed bound parameters in those positions over the
 * prepared-statement protocol — `pool.execute('... LIMIT ?', [50])` fails with
 * "Incorrect arguments to mysqld_stmt_execute" (ER_WRONG_ARGUMENTS) — while the
 * same value sent as a string is accepted and coerced by the server.
 *
 * Rather than dropping to `pool.query()` (client-side escaping) or inlining the
 * numbers, we coerce just these placeholders and leave every other parameter
 * strongly typed on a real prepared statement.
 *
 * Handles `LIMIT ?`, `OFFSET ?` and the `LIMIT ?, ?` shorthand.
 *
 * @param {string} sql
 * @returns {Set<number>} zero-based placeholder positions
 */
export function limitPlaceholderPositions(sql) {
  const positions = new Set();
  if (typeof sql !== 'string') return positions;

  // Blank out string literals so a '?' inside one is not mistaken for a bind.
  const scrubbed = sql.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");

  const placeholder = /\?/g;
  let index = -1;
  let match;
  while ((match = placeholder.exec(scrubbed)) !== null) {
    index += 1;
    const preceding = scrubbed.slice(0, match.index);
    const afterLimitOrOffset = /\b(?:limit|offset)\s*$/i.test(preceding);
    const secondArgOfLimit = /\blimit\s+\?\s*,\s*$/i.test(preceding);
    if (afterLimitOrOffset || secondArgOfLimit) positions.add(index);
  }
  return positions;
}

/**
 * Bind values for `sql`, with LIMIT/OFFSET arguments coerced to strings.
 * Non-numeric or non-finite values are passed through untouched so a bad
 * argument still surfaces as a database error rather than silently becoming 0.
 *
 * @param {string} sql
 * @param {Array} params
 * @returns {Array}
 */
export function prepareParams(sql, params = []) {
  const positions = limitPlaceholderPositions(sql);
  if (positions.size === 0) return params;

  return params.map((value, index) => {
    if (!positions.has(index)) return value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
    if (typeof value === 'bigint') return String(value);
    return value;
  });
}

/**
 * Execute a parameterised SQL query.
 * Returns the result rows on success, throws on error.
 *
 * @param {string} sql - Parameterised SQL (use ? placeholders)
 * @param {Array}  params - Values to bind
 * @returns {Promise<Array>} rows
 */
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, prepareParams(sql, params));
  return rows;
}

/**
 * Run a set of writes atomically inside a single transaction.
 *
 * The callback receives a `tx` object with the same `query(sql, params)`
 * signature as the module-level helper, but bound to the transaction's
 * dedicated connection. If the callback throws, the transaction is rolled
 * back; otherwise it is committed. The connection is always released.
 *
 * @param {(tx: { query: (sql: string, params?: Array) => Promise<Array> }) => Promise<any>} fn
 * @returns {Promise<any>} whatever the callback returns
 */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  const tx = {
    query: async (sql, params = []) => {
      const [rows] = await conn.execute(sql, prepareParams(sql, params));
      return rows;
    },
  };

  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback failure; original error is more important
    }
    throw err;
  } finally {
    conn.release();
  }
}

export default pool;
