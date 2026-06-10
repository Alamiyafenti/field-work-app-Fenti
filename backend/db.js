const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../field_work.db');

let db = null;
let SQL = null;

function columnExists(tableName, columnName) {
  const result = db.exec(`PRAGMA table_info(${tableName})`);
  if (result.length === 0) {
    return false;
  }

  return result[0].values.some((row) => row[1] === columnName);
}

function ensureColumn(tableName, columnName, columnDefinition) {
  if (!columnExists(tableName, columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

async function initializeDatabase() {
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('✓ Database loaded from file');
  } else {
    db = new SQL.Database();
    console.log('✓ New database created');
  }

  db.run('PRAGMA foreign_keys = ON');

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      client TEXT,
      date DATE NOT NULL,
      day VARCHAR(20),
      location TEXT,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      workers TEXT,
      worker_count INTEGER NOT NULL CHECK (worker_count > 0),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_id TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('manager', 'employee')),
      full_name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      serial_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL UNIQUE,
      hourly_rate REAL,
      distance_km REAL,
      food_cost REAL,
      travel_cost REAL,
      final_cost REAL,
      final_cost_vat REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
    )
  `);

  ensureColumn('reports', 'worker_ids', 'worker_ids TEXT');
  ensureColumn('reports', 'created_by_user_id', 'created_by_user_id INTEGER');
  ensureColumn('users', 'phone_number', 'phone_number TEXT');
  ensureColumn('employees', 'job_title', 'job_title TEXT');
  ensureColumn('employees', 'project_bonus', 'project_bonus REAL DEFAULT 0');

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reports_project ON reports(project_name)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reports_created_by_user ON reports(created_by_user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_costs_report_id ON costs(report_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_serial_id ON users(serial_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);

  saveDatabase();
  console.log('✓ Database schema ready');
}

function getDb() {
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, buffer);
  }
}

module.exports = { initializeDatabase, getDb, saveDatabase };
