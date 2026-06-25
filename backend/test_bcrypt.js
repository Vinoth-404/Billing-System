const bcrypt = require("bcryptjs");
const db = require("./config/db");

async function test() {
  const password = "admin123";
  
  db.query("SELECT setting_value FROM settings WHERE setting_key = 'admin_password'", async (err, res) => {
    if (err) {
      console.error("DB Query error:", err);
      process.exit(1);
    }
    if (res.length === 0) {
      console.log("No password in DB!");
      process.exit(0);
    }
    const hash = res[0].setting_value;
    console.log("DB Hash:", hash);
    const match = await bcrypt.compare(password, hash);
    console.log("Match result:", match);
    process.exit(0);
  });
}
test();
