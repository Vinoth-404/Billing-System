const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const mysql = require("mysql2");

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
 * Format Date for UI display (e.g. 21 Sep 2026, 10:30:00 AM)
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
 * Create a complete .sql dump of the database
 */
async function generateDatabaseDump() {
  const [tablesRes] = await db.query("SHOW TABLES");
  const dbName = process.env.DB_NAME || "slipper_shop";
  const tableNames = tablesRes.map((t) => Object.values(t)[0]);

  let sqlDump = `-- ========================================================\n`;
  sqlDump += `-- Slipper Shop Management System - Database Backup\n`;
  sqlDump += `-- Database: ${dbName}\n`;
  sqlDump += `-- Date & Time: ${getFormattedDateTime()}\n`;
  sqlDump += `-- ========================================================\n\n`;
  sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n`;
  sqlDump += `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n`;

  for (const tableName of tableNames) {
    // 1. Structure
    const [createTableRes] = await db.query(`SHOW CREATE TABLE \`${tableName}\``);
    const createTableSql = createTableRes[0]["Create Table"];

    sqlDump += `-- --------------------------------------------------------\n`;
    sqlDump += `-- Table structure for \`${tableName}\`\n`;
    sqlDump += `-- --------------------------------------------------------\n`;
    sqlDump += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
    sqlDump += `${createTableSql};\n\n`;

    // 2. Data
    const [rows] = await db.query(`SELECT * FROM \`${tableName}\``);
    if (rows.length > 0) {
      sqlDump += `-- Data dumping for table \`${tableName}\`\n`;
      const columns = Object.keys(rows[0]).map((col) => `\`${col}\``).join(", ");

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuesList = batch
          .map((row) => {
            const rowValues = Object.values(row).map((val) => mysql.escape(val));
            return `(${rowValues.join(", ")})`;
          })
          .join(",\n  ");

        sqlDump += `INSERT INTO \`${tableName}\` (${columns}) VALUES\n  ${valuesList};\n`;
      }
      sqlDump += `\n`;
    }
  }

  sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  return sqlDump;
}

/**
 * Execute a SQL dump script against the database
 */
async function restoreDatabaseFromSql(sqlContent) {
  const connection = await db.getConnection();
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    const statements = parseSqlStatements(sqlContent);

    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed.length > 0 && !trimmed.startsWith("--") && !trimmed.startsWith("/*")) {
        await connection.query(trimmed);
      }
    }

    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    connection.release();
  }
}

/**
 * Split SQL string into statements safely handling quotes and escaped quotes
 */
function parseSqlStatements(sql) {
  const cleanSql = sql.replace(/^--.*$/gm, "");
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

    if (char === "\\") {
      currentStatement += char;
      isEscaped = true;
      continue;
    }

    if (inString) {
      currentStatement += char;
      if (char === quoteChar) {
        inString = false;
      }
    } else {
      if (char === "'" || char === '"' || char === "`") {
        inString = true;
        quoteChar = char;
        currentStatement += char;
      } else if (char === ";") {
        if (currentStatement.trim().length > 0) {
          statements.push(currentStatement.trim());
        }
        currentStatement = "";
      } else {
        currentStatement += char;
      }
    }
  }

  if (currentStatement.trim().length > 0) {
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
