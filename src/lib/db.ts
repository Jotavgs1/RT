import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'rt.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracked_items (
      id TEXT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      thumbnail TEXT,
      status TEXT DEFAULT 'active',
      unresolved INTEGER DEFAULT 0,
      unresolved_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS item_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      available_qty INTEGER,
      sold_qty INTEGER,
      sold_qty_raw TEXT,
      price REAL,
      status TEXT,
      FOREIGN KEY (item_id) REFERENCES tracked_items(id)
    );

    CREATE TABLE IF NOT EXISTS daily_item_metrics (
      item_id TEXT NOT NULL,
      date TEXT NOT NULL,
      units_sold_est REAL NOT NULL DEFAULT 0,
      revenue_est REAL NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      reliability TEXT NOT NULL DEFAULT 'Baixa',
      PRIMARY KEY (item_id, date),
      FOREIGN KEY (item_id) REFERENCES tracked_items(id)
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      project_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      units_sold_est_total REAL NOT NULL DEFAULT 0,
      items_sold_count INTEGER NOT NULL DEFAULT 0,
      revenue_est_total REAL NOT NULL DEFAULT 0,
      avg_ticket_est REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, date)
    );
  `);
}

export interface Project {
  id: number;
  name: string;
  created_at: string;
}

export interface TrackedItem {
  id: string;
  project_id: number;
  url: string;
  title: string | null;
  thumbnail: string | null;
  status: string;
  unresolved: number;
  unresolved_message: string | null;
  created_at: string;
}

export interface ItemSnapshot {
  id: number;
  item_id: string;
  captured_at: string;
  available_qty: number | null;
  sold_qty: number | null;
  sold_qty_raw: string | null;
  price: number | null;
  status: string | null;
}

export interface DailyItemMetric {
  item_id: string;
  date: string;
  units_sold_est: number;
  revenue_est: number;
  avg_price: number;
  reliability: string;
}

export interface DailyMetric {
  project_id: number;
  date: string;
  units_sold_est_total: number;
  items_sold_count: number;
  revenue_est_total: number;
  avg_ticket_est: number;
}
