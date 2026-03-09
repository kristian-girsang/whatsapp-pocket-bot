const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function createDb(dbPath) {
  ensureDirForFile(dbPath);
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function onRun(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });

  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });

  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });

  const close = () =>
    new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });

  return { db, run, get, all, close };
}

async function hasColumn(dbClient, tableName, columnName) {
  const rows = await dbClient.all(`PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function initDatabase(dbClient) {
  await dbClient.run('PRAGMA foreign_keys = ON');

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name, type),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      category TEXT NOT NULL,
      limit_amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, month_key, category),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, keyword),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbClient.run(`
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'monthly')),
      day_of_month INTEGER,
      time_hhmm TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sent_key TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  if (!(await hasColumn(dbClient, 'transactions', 'account_id'))) {
    await dbClient.run('ALTER TABLE transactions ADD COLUMN account_id INTEGER');
  }

  if (!(await hasColumn(dbClient, 'categories', 'user_id'))) {
    await dbClient.run('ALTER TABLE categories ADD COLUMN user_id INTEGER');
  }

  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month_key)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_category_rules_user ON category_rules(user_id)');
  await dbClient.run('CREATE INDEX IF NOT EXISTS idx_scheduled_reports_user ON scheduled_reports(user_id)');

  logger.info('database_initialized');
}

module.exports = {
  createDb,
  initDatabase,
};
