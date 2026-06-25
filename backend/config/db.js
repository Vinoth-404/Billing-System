require("dotenv").config();
const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

connection.connect((err) => {
  if (err) {
    console.error(err);
  } else {
    console.log("DB Connected Successfully");
    // Run DB Migrations
    const runMigration = require("./migrate");
    runMigration();
  }
});

module.exports = connection;