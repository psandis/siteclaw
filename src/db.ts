import Database from "better-sqlite3";
import type { LighthouseResult, Run } from "./types.js";

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
      render_blocking_resources TEXT NOT NULL,
      opportunities TEXT NOT NULL,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_site_name ON runs (site_name);
  `);
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
    `INSERT INTO runs (site_name, url, timestamp, performance_score, render_blocking_resources, opportunities, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    siteName,
    url,
    new Date().toISOString(),
    result.performanceScore,
    JSON.stringify(result.renderBlockingResources),
    JSON.stringify(result.opportunities),
    note,
  );
}

// better-sqlite3 returns plain rows with snake_case columns and JSON-as-text fields;
// this maps a row back to the typed, camelCase Run shape used everywhere else in the app.
function rowToRun(row: any): Run {
  return {
    id: row.id,
    siteName: row.site_name,
    url: row.url,
    timestamp: row.timestamp,
    performanceScore: row.performance_score,
    renderBlockingResources: JSON.parse(row.render_blocking_resources),
    opportunities: JSON.parse(row.opportunities),
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
