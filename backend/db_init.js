require("dotenv").config();
const mysql = require("mysql2");

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
});

connection.connect((err) => {
  if (err) {
    console.error("Connection error:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL server.");
  connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``, (err, results) => {
    if (err) {
      console.error("Error creating database:", err);
      process.exit(1);
    }
    console.log(`Database '${process.env.DB_NAME}' created or already exists.`);
    connection.end(() => {
      process.exit(0);
    });
  });
});
