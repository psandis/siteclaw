import Database from "better-sqlite3";
import type { Diagnostics, LighthouseResult, Run, SecurityFindings } from "./types.js";

const EMPTY_CORE_METRICS = { fcp: 0, lcp: 0, speedIndex: 0, tti: 0, tbt: 0, cls: 0 };
const EMPTY_DIAGNOSTICS: Diagnostics = {
  domElementCount: 0,
  totalRequests: 0,
  totalTransferBytes: 0,
  thirdParty: [],
};
const EMPTY_SECURITY: SecurityFindings = {
  onHttps: true,
  hasHsts: true,
  hasCspAgainstXss: true,
  deprecatedApiUsages: [],
};

// Adds a column to an existing table if it isn't already there, so older local databases pick
// up new fields in place instead of needing a manual migration step or losing history.
function ensureColumn(db: Database.Database, table: string, column: string, type: string): void {
  const exists = db
    .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`)
    .get(column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Opens (and initializes, if needed) the SQLite history store.
// WAL mode is used so `check` (writer) and `list`/`history` (readers) don't lock each other out.
export function openDb(path = "siteclaw.db") {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_name TEXT NOT NULL,
      url TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      performance_score REAL NOT NULL,
      core_metrics TEXT,
      render_blocking_resources TEXT NOT NULL,
      opportunities TEXT NOT NULL,
      diagnostics TEXT,
      security TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_site_name ON runs (site_name);
  `);
  ensureColumn(db, "runs", "core_metrics", "TEXT");
  ensureColumn(db, "runs", "diagnostics", "TEXT");
  ensureColumn(db, "runs", "security", "TEXT");
  return db;
}

// Records one Lighthouse run. Runs are append-only: history is never overwritten or deleted here,
// so `siteclaw history` always reflects every check that was ever made, even after a site
// is later removed from sites.json (list/correlate filter it out separately, the row stays).
export function insertRun(
  db: ReturnType<typeof openDb>,
  siteName: string,
  url: string,
  result: LighthouseResult,
  note: string | null,
): void {
  db.prepare(
    `INSERT INTO runs (site_name, url, timestamp, performance_score, core_metrics, render_blocking_resources, opportunities, diagnostics, security, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    siteName,
    url,
    new Date().toISOString(),
    result.performanceScore,
    JSON.stringify(result.coreMetrics),
    JSON.stringify(result.renderBlockingResources),
    JSON.stringify(result.opportunities),
    JSON.stringify(result.diagnostics),
    JSON.stringify(result.security),
    note,
  );
}

// better-sqlite3 returns plain rows with snake_case columns and JSON-as-text fields;
// this maps a row back to the typed, camelCase Run shape used everywhere else in the app.
// core_metrics/diagnostics/security can be null for rows written before those columns existed;
// those fall back to empty/neutral defaults rather than crashing on JSON.parse(null).
function rowToRun(row: any): Run {
  return {
    id: row.id,
    siteName: row.site_name,
    url: row.url,
    timestamp: row.timestamp,
    performanceScore: row.performance_score,
    coreMetrics: row.core_metrics ? JSON.parse(row.core_metrics) : EMPTY_CORE_METRICS,
    renderBlockingResources: JSON.parse(row.render_blocking_resources),
    opportunities: JSON.parse(row.opportunities),
    diagnostics: row.diagnostics ? JSON.parse(row.diagnostics) : EMPTY_DIAGNOSTICS,
    security: row.security ? JSON.parse(row.security) : EMPTY_SECURITY,
    note: row.note,
  };
}

// One row per site: the most recent run only. Used by `list` and `correlate`, which only
// care about current state, not full history.
export function getLatestRunPerSite(db: ReturnType<typeof openDb>): Run[] {
  const rows = db
    .prepare(
      `SELECT r.* FROM runs r
       WHERE r.id = (SELECT MAX(id) FROM runs WHERE site_name = r.site_name)
       ORDER BY r.site_name`,
    )
    .all();
  return rows.map(rowToRun);
}

// Full run history for one site, oldest first, so trend/diff logic can compare consecutive runs.
export function getHistoryForSite(db: ReturnType<typeof openDb>, siteName: string): Run[] {
  const rows = db
    .prepare(`SELECT * FROM runs WHERE site_name = ? ORDER BY timestamp ASC`)
    .all(siteName);
  return rows.map(rowToRun);
}
