const fs = require("fs");
const path = require("path");
const db = require("../config/sqlite-db");

/**
 * Format Date as YYYY-MM-DD_HH-mm-ss
 */
function getTimestampString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Format Date for UI display
 */
function getFormattedDateTime(date = new Date()) {
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

/**
 * Escape a JavaScript value for SQLite SQL.
 */
function escapeSqlValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return String(value);
    }
    return "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString("hex")}'`;
  }

  return `'${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")}'`;
}

/**
 * Create a complete SQLite-compatible .sql dump.
 */
async function generateDatabaseDump() {
  const [tables] = await db.query(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);

  let sqlDump = `-- ========================================================\n`;
  sqlDump += `-- Slipper Shop Management System - SQLite Database Backup\n`;
  sqlDump += `-- Database: SQLite\n`;
  sqlDump += `-- Date & Time: ${getFormattedDateTime()}\n`;
  sqlDump += `-- ========================================================\n\n`;

  sqlDump += `PRAGMA foreign_keys = OFF;\n`;
  sqlDump += `BEGIN TRANSACTION;\n\n`;

  for (const table of tables) {
    const tableName = table.name;

    const [schemaRows] = await db.query(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [tableName]
    );

    if (schemaRows.length === 0 || !schemaRows[0].sql) {
      continue;
    }

    const createSql = schemaRows[0].sql;

    sqlDump += `-- --------------------------------------------------------\n`;
    sqlDump += `-- Table structure for "${tableName}"\n`;
    sqlDump += `-- --------------------------------------------------------\n`;
    sqlDump += `DROP TABLE IF EXISTS "${tableName}";\n`;
    sqlDump += `${createSql};\n\n`;

    const [rows] = await db.query(
      `SELECT * FROM "${tableName}"`
    );

    if (rows.length > 0) {
      sqlDump += `-- Data for "${tableName}"\n`;

      const columns = Object.keys(rows[0])
        .map((column) => `"${column.replace(/"/g, '""')}"`)
        .join(", ");

      const batchSize = 100;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        const valuesList = batch
          .map((row) => {
            const values = Object.values(row)
              .map(escapeSqlValue)
              .join(", ");

            return `(${values})`;
          })
          .join(",\n");

        sqlDump += `INSERT INTO "${tableName}" (${columns}) VALUES\n${valuesList};\n`;
      }

      sqlDump += `\n`;
    }
  }

  sqlDump += `COMMIT;\n`;
  sqlDump += `PRAGMA foreign_keys = ON;\n`;

  return sqlDump;
}

/**
 * Restore a SQLite SQL dump.
 */
async function restoreDatabaseFromSql(sqlContent) {
  if (!sqlContent || typeof sqlContent !== "string") {
    throw new Error("Invalid SQL backup content.");
  }

  const statements = parseSqlStatements(sqlContent);

  const { sqlite } = db;

  sqlite.pragma("foreign_keys = OFF");

  try {
    const transaction = sqlite.transaction(() => {
      for (const statement of statements) {
        const trimmed = statement.trim();

        if (!trimmed) {
          continue;
        }

        const upper = trimmed.toUpperCase();

        // Ignore transaction / MySQL compatibility commands
        if (
          upper === "BEGIN TRANSACTION" ||
          upper === "BEGIN" ||
          upper === "COMMIT" ||
          upper === "ROLLBACK" ||
          upper.startsWith("SET FOREIGN_KEY_CHECKS") ||
          upper.startsWith("SET SQL_MODE")
        ) {
          continue;
        }

        sqlite.prepare(trimmed).run();
      }
    });

    transaction();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

/**
 * Split SQL into statements while respecting quoted strings.
 */
function parseSqlStatements(sql) {
  const cleanSql = sql.replace(/^\s*--.*$/gm, "");

  const statements = [];
  let currentStatement = "";

  let inString = false;
  let quoteChar = "";
  let isEscaped = false;

  for (let i = 0; i < cleanSql.length; i++) {
    const char = cleanSql[i];

    if (isEscaped) {
      currentStatement += char;
      isEscaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      currentStatement += char;
      isEscaped = true;
      continue;
    }

    if (inString) {
      currentStatement += char;

      if (char === quoteChar) {
        // SQL uses doubled single quotes to escape apostrophes.
        if (
          quoteChar === "'" &&
          cleanSql[i + 1] === "'"
        ) {
          currentStatement += cleanSql[++i];
        } else {
          inString = false;
        }
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      inString = true;
      quoteChar = char;
      currentStatement += char;
      continue;
    }

    if (char === ";") {
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }

      currentStatement = "";
      continue;
    }

    currentStatement += char;
  }

  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements;
}

module.exports = {
  getTimestampString,
  getFormattedDateTime,
  generateDatabaseDump,
  restoreDatabaseFromSql
};
