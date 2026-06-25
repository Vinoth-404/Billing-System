const db = require("./db");
const bcrypt = require("bcryptjs");

async function runMigration() {
  console.log("Starting DB Migration (Redesign)...");

  // Helper to execute query with promise
  const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.query(sql, params, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  };

  try {
    // 1. Ensure products table exists and has proper columns
    const columns = await query("SHOW COLUMNS FROM products");
    const columnNames = columns.map(c => c.Field);

    if (!columnNames.includes("discount_percent")) {
      console.log("Adding 'discount_percent' column to products table...");
      await query("ALTER TABLE products ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT 0.00");
    }

    if (!columnNames.includes("supplier_name")) {
      console.log("Adding 'supplier_name' column to products table...");
      await query("ALTER TABLE products ADD COLUMN supplier_name VARCHAR(100) DEFAULT NULL");
    }

    // 2. Create sales table
    console.log("Creating sales table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_no VARCHAR(50) UNIQUE NOT NULL,
        date DATETIME NOT NULL,
        discount DECIMAL(10,2) DEFAULT 0.00,
        gst DECIMAL(10,2) DEFAULT 0.00,
        total_price DECIMAL(10,2) NOT NULL,
        total_profit DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure sales table has customer_name and customer_phone columns
    const salesColumns = await query("SHOW COLUMNS FROM sales");
    const salesColumnNames = salesColumns.map(c => c.Field);

    if (!salesColumnNames.includes("customer_name")) {
      console.log("Adding 'customer_name' column to sales table...");
      await query("ALTER TABLE sales ADD COLUMN customer_name VARCHAR(100) DEFAULT 'Walk-in Customer'");
    }

    if (!salesColumnNames.includes("customer_phone")) {
      console.log("Adding 'customer_phone' column to sales table...");
      await query("ALTER TABLE sales ADD COLUMN customer_phone VARCHAR(20) DEFAULT NULL");
    }

    // 3. Create sale_items table
    console.log("Creating sale_items table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        brand VARCHAR(100),
        type VARCHAR(100),
        size VARCHAR(20),
        color VARCHAR(50),
        quantity INT NOT NULL,
        purchase_price DECIMAL(10,2) NOT NULL,
        selling_price DECIMAL(10,2) NOT NULL,
        profit DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      )
    `);

    // 4. Create activity_log table
    console.log("Creating activity_log table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4.5. Create notifications table
    console.log("Creating notifications table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        message VARCHAR(255) NOT NULL,
        product_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure notifications table has recipient and status columns
    const notifColumns = await query("SHOW COLUMNS FROM notifications");
    const notifColumnNames = notifColumns.map(c => c.Field);

    if (!notifColumnNames.includes("recipient")) {
      console.log("Adding 'recipient' column to notifications table...");
      await query("ALTER TABLE notifications ADD COLUMN recipient VARCHAR(50) DEFAULT NULL");
    }

    if (!notifColumnNames.includes("status")) {
      console.log("Adding 'status' column to notifications table...");
      await query("ALTER TABLE notifications ADD COLUMN status VARCHAR(20) DEFAULT NULL");
    }

    // Create settings table
    console.log("Creating settings table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value MEDIUMTEXT NOT NULL
      )
    `);

    // Ensure setting_value column is MEDIUMTEXT for existing databases
    try {
      await query("ALTER TABLE settings MODIFY COLUMN setting_value MEDIUMTEXT NOT NULL");
    } catch (colErr) {
      console.log("Database column modification skipped:", colErr.message);
    }

    // Seed default settings if they don't exist
    const hashedDefault = await bcrypt.hash("admin123", 10);
    const settingsSeed = [
      { key: "owner_mobile", value: "+91 9876543210" },
      { key: "sms_enabled", value: "false" },
      { key: "stock_threshold", value: "5" },
      { key: "sms_provider", value: "twilio" },
      { key: "sms_api_key", value: "" },
      { key: "sms_sender_id", value: "" },
      { key: "sms_twilio_sid", value: "" },
      { key: "admin_password", value: hashedDefault }
    ];
    for (const seed of settingsSeed) {
      const exists = await query("SELECT * FROM settings WHERE setting_key = ?", [seed.key]);
      if (exists.length === 0) {
        await query("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)", [seed.key, seed.value]);
      }
    }

    // Seed sample notifications if empty
    const notifCountRes = await query("SELECT COUNT(*) AS count FROM notifications");
    if (notifCountRes[0].count === 0) {
      console.log("Seeding sample notifications...");
      await query(`
        INSERT INTO notifications (type, message, recipient, status, created_at) VALUES
        ('stock_addition', 'Added 25 Nike Slides Size 9 Black.', NULL, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
        ('sale', 'Sold 1 Adidas Slides Size 11 Royal Blue.', NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
        ('low_stock', 'Low Stock Alert: Adidas Slides Size 11 Royal Blue - Only 3 pairs remaining.', NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
        ('out_of_stock', 'Out Of Stock: Crocs Clogs Size 9 Black & Red.', NULL, NULL, DATE_SUB(NOW(), INTERVAL 30 MINUTE))
      `);
    }

    // 4.6. Create brands, product_types, colors, sizes tables
    console.log("Creating brands table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS brands (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    console.log("Creating product_types table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS product_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    console.log("Creating colors table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS colors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    console.log("Creating sizes table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS sizes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(20) UNIQUE NOT NULL
      )
    `);

    console.log("Creating expenses table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        expense_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description TEXT DEFAULT NULL,
        expense_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log("Creating expense_categories table if not exists...");
    await query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      )
    `);

    // Seed master tables
    console.log("Seeding brands table...");
    await query("DELETE FROM brands");
    await query("INSERT INTO brands (name) VALUES ('Bata'), ('VKC'), ('Adidas'), ('Paragon'), ('Puma'), ('Crocs')");

    console.log("Seeding product_types table...");
    await query("DELETE FROM product_types");
    await query("INSERT INTO product_types (name) VALUES ('Slides'), ('Sandals'), ('Flip Flops'), ('Clogs'), ('Shoes')");

    console.log("Seeding colors table...");
    await query("DELETE FROM colors");
    await query("INSERT INTO colors (name) VALUES ('Black'), ('Blue'), ('White'), ('Red'), ('Brown')");

    console.log("Seeding sizes table...");
    await query("DELETE FROM sizes");
    await query("INSERT INTO sizes (name) VALUES ('5'), ('6'), ('7'), ('8'), ('9'), ('10'), ('11')");

    console.log("Seeding expense_categories table if empty...");
    const catCheck = await query("SELECT COUNT(*) AS count FROM expense_categories");
    if (catCheck[0].count === 0) {
      await query("INSERT INTO expense_categories (name) VALUES ('Food & Tea'), ('Stationery'), ('Travel'), ('Internet'), ('Salary'), ('Rent'), ('Donation'), ('Miscellaneous')");
    }

    // 5. Insert sample products if empty (or only 1 product)
    const productCountRes = await query("SELECT COUNT(*) AS count FROM products");
    if (productCountRes[0].count <= 1) {
      console.log("Populating database with realistic slipper products...");
      await query("DELETE FROM products");

      const sampleProducts = [
        ["SLIP-001", "Nike", "Slides", "9", "Black", 1200.00, 1999.00, 10.00, 25, "Nike India Distributors"],
        ["SLIP-002", "Crocs", "Clogs", "8", "Navy Blue", 1800.00, 2995.00, 5.00, 15, "Crocs Retail Private Ltd"],
        ["SLIP-003", "Bata", "House Slippers", "7", "Chocolate Brown", 300.00, 599.00, 0.00, 40, "Bata Wholesale Hub"],
        ["SLIP-004", "Sparx", "Sandals", "10", "Charcoal Grey", 450.00, 899.00, 15.00, 30, "Relaxo Footwears Depot"],
        ["SLIP-005", "Paragon", "Slipper", "8", "Black", 150.00, 299.00, 0.00, 10, "Paragon Distributors Ltd"], // Seeded for Paragon 8 Black stock=10
        ["SLIP-006", "Puma", "Slides", "9", "Snow White", 1000.00, 1799.00, 12.00, 18, "Puma Sports Logistics"],
        ["SLIP-007", "Adidas", "Slides", "11", "Royal Blue", 1500.00, 2499.00, 10.00, 3, "Adidas India Ltd"], // Low stock
        ["SLIP-008", "Crocs", "Clogs", "9", "Black & Red", 2400.00, 3995.00, 15.00, 0, "Crocs Retail Private Ltd"], // Out of stock
        ["SLIP-009", "Bata", "Sandals", "6", "Cherry Red", 500.00, 999.00, 5.00, 32, "Bata Wholesale Hub"],
        ["SLIP-010", "Sparx", "Slipper", "9", "Black", 350.00, 699.00, 10.00, 22, "Relaxo Footwears Depot"] // Seeded for Sparx 9 Black
      ];

      for (const p of sampleProducts) {
        await query(
          "INSERT INTO products (serial_no, brand, type, size, color, purchase_price, selling_price, discount_percent, stock, supplier_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          p
        );
      }
    }

    // 6. Populate sample sales if empty
    const salesCountRes = await query("SELECT COUNT(*) AS count FROM sales");
    if (salesCountRes[0].count === 0) {
      console.log("Populating database with realistic historical sales data...");
      
      const productsList = await query("SELECT * FROM products");
      const prodMap = {};
      productsList.forEach(p => {
        prodMap[p.serial_no] = p;
      });

      const today = new Date();
      const createDate = (daysAgo) => {
        const d = new Date(today);
        d.setDate(today.getDate() - daysAgo);
        return d;
      };

      const sampleSales = [
        {
          bill_no: "BILL-2026-0001",
          date: createDate(12),
          discount: 199.90,
          gst: 323.84,
          total_price: 2122.94,
          total_profit: 600.00,
          payment_method: "UPI",
          items: [{ serial_no: "SLIP-001", quantity: 1 }]
        },
        {
          bill_no: "BILL-2026-0002",
          date: createDate(10),
          discount: 149.75,
          gst: 512.15,
          total_price: 3357.40,
          total_profit: 1045.25,
          payment_method: "Card",
          items: [{ serial_no: "SLIP-002", quantity: 1 }]
        },
        {
          bill_no: "BILL-2026-0003",
          date: createDate(7),
          discount: 0.00,
          gst: 215.64,
          total_price: 1413.64,
          total_profit: 598.00,
          payment_method: "Cash",
          items: [{ serial_no: "SLIP-003", quantity: 2 }]
        },
        {
          bill_no: "BILL-2026-0004",
          date: createDate(5),
          discount: 134.85,
          gst: 137.55,
          total_price: 901.70,
          total_profit: 314.15,
          payment_method: "UPI",
          items: [{ serial_no: "SLIP-004", quantity: 1 }]
        },
        {
          bill_no: "BILL-2026-0005",
          date: createDate(2),
          discount: 0.00,
          gst: 107.64,
          total_price: 705.64,
          total_profit: 298.00,
          payment_method: "Cash",
          items: [{ serial_no: "SLIP-005", quantity: 2 }] // Paragon Slipper (2 sold)
        },
        {
          bill_no: "BILL-2026-0006",
          date: createDate(1), // Yesterday
          discount: 215.88,
          gst: 285.00,
          total_price: 1868.12,
          total_profit: 583.12,
          payment_method: "UPI",
          items: [{ serial_no: "SLIP-006", quantity: 1 }]
        },
        {
          bill_no: "BILL-2026-0007",
          date: new Date(), // Today
          discount: 249.90,
          gst: 404.84,
          total_price: 2653.94,
          total_profit: 749.10,
          payment_method: "Card",
          items: [{ serial_no: "SLIP-007", quantity: 1 }]
        },
        {
          bill_no: "BILL-2026-0008",
          date: new Date(), // Today
          discount: 0.00,
          gst: 107.82,
          total_price: 706.82,
          total_profit: 299.00,
          payment_method: "UPI",
          items: [{ serial_no: "SLIP-003", quantity: 1 }]
        }
      ];

      for (const sale of sampleSales) {
        const saleResult = await query(
          "INSERT INTO sales (bill_no, date, discount, gst, total_price, total_profit, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [sale.bill_no, sale.date, sale.discount, sale.gst, sale.total_price, sale.total_profit, sale.payment_method]
        );
        const saleId = saleResult.insertId;

        for (const item of sale.items) {
          const prod = prodMap[item.serial_no];
          if (prod) {
            const selling = prod.selling_price;
            const discountAmount = (selling * prod.discount_percent / 100);
            const actualSelling = selling - discountAmount;
            const profit = actualSelling - prod.purchase_price;
            
            await query(
              "INSERT INTO sale_items (sale_id, product_id, brand, type, size, color, quantity, purchase_price, selling_price, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [saleId, prod.id, prod.brand, prod.type, prod.size, prod.color, item.quantity, prod.purchase_price, actualSelling, profit * item.quantity]
            );
          }
        }
      }
    }

    // 7. Seed sample activities if empty
    const activityCountRes = await query("SELECT COUNT(*) AS count FROM activity_log");
    if (activityCountRes[0].count === 0) {
      console.log("Seeding activity logs...");
      const todayDateStr = new Date().toISOString().slice(0, 10);
      
      const activities = [
        { type: "sale", message: "Sold 2 Paragon Slippers (SLIP-005)", created_at: `${todayDateStr} 12:30:00` },
        { type: "addition", message: "Added 20 Bata Sandals (SLIP-009)", created_at: `${todayDateStr} 11:45:00` },
        { type: "sale", message: "Sold 1 Sparx Slipper (SLIP-010)", created_at: `${todayDateStr} 10:10:00` }
      ];

      for (const act of activities) {
        await query(
          "INSERT INTO activity_log (type, message, created_at) VALUES (?, ?, ?)",
          [act.type, act.message, act.created_at]
        );
      }
    }

    console.log("DB Migration completed successfully.");
  } catch (err) {
    console.error("Migration error:", err);
  }
}

module.exports = runMigration;
