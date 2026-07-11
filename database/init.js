const db = require('../config/db');

function initDB() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      phone TEXT,
      status TEXT DEFAULT 'disconnected',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      name TEXT,
      json_data TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      phone TEXT,
      current_step INTEGER DEFAULT 1,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      contact_id INTEGER,
      direction TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      flow_id INTEGER,
      filename TEXT,
      type TEXT
    )`,
  ];

  db.serialize(() => {
    queries.forEach((query) => db.run(query));

    db.all(`PRAGMA table_info(contacts)`, (tableErr, columns) => {
      if (!tableErr && Array.isArray(columns)) {
        const columnNames = columns.map((column) => column.name);

        if (!columnNames.includes('name')) {
          db.run(`ALTER TABLE contacts ADD COLUMN name TEXT`);
        }

        if (!columnNames.includes('created_at')) {
          db.run(`ALTER TABLE contacts ADD COLUMN created_at TEXT DEFAULT (datetime('now'))`);
          db.run(`UPDATE contacts SET created_at = datetime('now') WHERE created_at IS NULL`);
        }
      }
    });

    db.all(`PRAGMA table_info(accounts)`, (accErr, accColumns) => {
      if (!accErr && Array.isArray(accColumns)) {
        const accColumnNames = accColumns.map((column) => column.name);

        if (!accColumnNames.includes('last_activity')) {
          db.run(`ALTER TABLE accounts ADD COLUMN last_activity TEXT`);
        }
      }
    });

    db.get(`SELECT COUNT(*) AS count FROM users`, (err, row) => {
      if (err) {
        console.error('Failed to query users table:', err.message);
        return;
      }

      if (!row || row.count === 0) {
        db.run(
          `INSERT INTO users (username, password) VALUES (?, ?)`,
          ['admin', 'admin123'],
          (insertErr) => {
            if (insertErr) {
              console.error('Failed to insert default user:', insertErr.message);
            } else {
              console.log('Inserted default admin user.');
            }
          }
        );
      }
    });
  });
}

module.exports = {
  initDB,
};
