const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./usage.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usage (
      userId TEXT,
      date TEXT,
      count INTEGER,
      PRIMARY KEY (userId, date)
    )
  `);
});

module.exports = db;
