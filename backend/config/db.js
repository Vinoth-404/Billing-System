require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");

const getSslOption = () => {
    if (process.env.DB_SSL !== "true" && process.env.DB_SSL !== "1") {
        return undefined;
    }
    let ca = process.env.DB_SSL_CA;
    if (ca) {
        try {
            if (fs.existsSync(ca)) {
                ca = fs.readFileSync(ca, "utf8");
            }
        } catch (err) {
            // ca is certificate content string
        }
    }
    return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
};

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: getSslOption()
});

module.exports = pool;