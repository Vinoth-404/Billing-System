const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Keep the database outside the source code.
// This location will also be suitable when we package the app later.
const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "slipper-shop.db");

const db = new Database(dbPath);

// Improve SQLite performance and reliability
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

console.log(`SQLite database: ${dbPath}`);

module.exports = db;