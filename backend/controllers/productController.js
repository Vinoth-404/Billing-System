const db = require("../config/db");
const { sendSMS } = require("../services/smsService");
const bcrypt = require("bcryptjs");

// Helper to execute query with promise
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// Sync active alerts (low stock/out of stock notifications) in database
const syncProductNotifications = (productId, stock, brand, type, size, color) => {
  return new Promise(async (resolve, reject) => {
    try {
      const thresholdRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'stock_threshold'");
      const threshold = thresholdRes.length > 0 ? parseInt(thresholdRes[0].setting_value, 10) : 5;

      const prodRes = await query("SELECT serial_no FROM products WHERE id = ?", [productId]);
      const sku = prodRes.length > 0 ? prodRes[0].serial_no : "N/A";

      const lowStockMsg = `⚠️ Low Stock Alert\nProduct: ${brand} ${type} ${color} Size ${size}\nSKU: ${sku}\nAvailable Stock: ${stock} pairs\nThreshold: ${threshold} pairs`;
      const outOfStockMsg = `🚫 Out of Stock\nProduct: ${brand} ${type} ${color} Size ${size}\nSKU: ${sku}`;

      if (stock >= threshold) {
        db.query(
          "DELETE FROM notifications WHERE product_id = ? AND type IN ('low_stock', 'out_of_stock')",
          [productId],
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      } else if (stock > 0 && stock < threshold) {
        db.query(
          "DELETE FROM notifications WHERE product_id = ? AND type = 'out_of_stock'",
          [productId],
          (err) => {
            if (err) return reject(err);
            db.query(
              "SELECT * FROM notifications WHERE product_id = ? AND type = 'low_stock'",
              [productId],
              (selErr, selRes) => {
                if (selErr) return reject(selErr);
                if (selRes.length > 0) {
                  db.query(
                    "UPDATE notifications SET message = ? WHERE id = ?",
                    [lowStockMsg, selRes[0].id],
                    (upErr) => {
                      if (upErr) return reject(upErr);
                      resolve();
                    }
                  );
                } else {
                  db.query(
                    "INSERT INTO notifications (type, message, product_id) VALUES ('low_stock', ?, ?)",
                    [lowStockMsg, productId],
                    async (insErr) => {
                      if (insErr) return reject(insErr);
                      const smsMessage = `Low Stock Alert\n\n${brand} ${type}\nCurrent Stock: ${stock} pairs\n\nPlease restock soon.`;
                      await sendSMS("sms_low_stock", smsMessage);
                      resolve();
                    }
                  );
                }
              }
            );
          }
        );
      } else if (stock === 0) {
        db.query(
          "DELETE FROM notifications WHERE product_id = ? AND type = 'low_stock'",
          [productId],
          (err) => {
            if (err) return reject(err);
            db.query(
              "SELECT * FROM notifications WHERE product_id = ? AND type = 'out_of_stock'",
              [productId],
              (selErr, selRes) => {
                if (selErr) return reject(selErr);
                if (selRes.length > 0) {
                  db.query(
                    "UPDATE notifications SET message = ? WHERE id = ?",
                    [outOfStockMsg, selRes[0].id],
                    (upErr) => {
                      if (upErr) return reject(upErr);
                      resolve();
                    }
                  );
                } else {
                  db.query(
                    "INSERT INTO notifications (type, message, product_id) VALUES ('out_of_stock', ?, ?)",
                    [outOfStockMsg, productId],
                    async (insErr) => {
                      if (insErr) return reject(insErr);
                      const smsMessage = `Out Of Stock Alert\n\n${brand} ${type}\nCurrent Stock: 0\n\nImmediate restocking required.`;
                      await sendSMS("sms_out_of_stock", smsMessage);
                      resolve();
                    }
                  );
                }
              }
            );
          }
        );
      } else {
        resolve();
      }
    } catch (e) {
      reject(e);
    }
  });
};

// Get all products
exports.getProducts = (req, res) => {
  db.query("SELECT * FROM products ORDER BY created_at DESC", (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(result);
  });
};

// Get single product by Serial Number
exports.getProductBySerial = (req, res) => {
  const { serial_no } = req.params;
  db.query("SELECT * FROM products WHERE serial_no = ?", [serial_no], (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(result[0]);
  });
};

// Get unique product filters (Brand, Type, Size, Color)
exports.getProductFilters = async (req, res) => {
  try {
    const [brands, types, sizes, colors] = await Promise.all([
      query("SELECT name FROM brands ORDER BY name"),
      query("SELECT name FROM product_types ORDER BY name"),
      query("SELECT name FROM sizes ORDER BY CAST(name AS UNSIGNED), name"),
      query("SELECT name FROM colors ORDER BY name")
    ]);

    res.json({
      brands: brands.map(b => b.name),
      types: types.map(t => t.name),
      sizes: sizes.map(s => s.name),
      colors: colors.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get product by attributes
exports.getProductByAttributes = (req, res) => {
  const { brand, type, size, color } = req.query;
  if (!brand || !type || !size || !color) {
    return res.status(400).json({ error: "Missing attributes query" });
  }
  db.query(
    "SELECT * FROM products WHERE brand = ? AND type = ? AND size = ? AND color = ?",
    [brand, type, size, color],
    (err, result) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (result.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(result[0]);
    }
  );
};

// Add or update stock
exports.addOrUpdateStock = async (req, res) => {
  const {
    brand,
    type,
    size,
    color,
    purchase_price,
    selling_price,
    discount_percent,
    stock,
    supplier_name
  } = req.body;

  if (!brand || !type || !size || !color || purchase_price === undefined || selling_price === undefined || stock === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const stockVal = parseInt(stock);

  try {
    // Check if same Brand + Type + Size + Color already exists in database
    const result = await query(
      "SELECT * FROM products WHERE brand = ? AND type = ? AND size = ? AND color = ?",
      [brand, type, size, color]
    );

    if (result.length > 0) {
      // Product exists, update stock
      const existingProduct = result[0];
      const newStock = existingProduct.stock + stockVal;

      const updateSql = `
        UPDATE products 
        SET purchase_price = ?, selling_price = ?, discount_percent = ?, stock = ?, supplier_name = ?
        WHERE id = ?
      `;
      const values = [purchase_price, selling_price, discount_percent || 0, newStock, supplier_name || null, existingProduct.id];

      await query(updateSql, values);
      
      // Log to activity_log
      db.query(
        "INSERT INTO activity_log (type, message) VALUES ('addition', ?)",
        [`Added ${stockVal} ${brand} ${type}s`],
        (logErr) => {
          if (logErr) console.error("Error writing stock activity log:", logErr);
        }
      );

      // Write stock addition notification
      const additionMessage = `Added ${stockVal} ${brand} ${type} Size ${size} ${color}.`;
      db.query(
        "INSERT INTO notifications (type, message, product_id) VALUES ('stock_addition', ?, ?)",
        [additionMessage, existingProduct.id],
        (notifErr) => {
          if (notifErr) console.error("Error writing stock addition notification:", notifErr);
        }
      );

      // Sync notifications alert
      try {
        await syncProductNotifications(existingProduct.id, newStock, brand, type, size, color);
      } catch (syncErr) {
        console.error("Error syncing stock notifications:", syncErr);
      }

      res.json({ message: "Product stock updated successfully", product: { ...existingProduct, stock: newStock } });
    } else {
      // Product does not exist. Auto-generate a new unique SKU/Serial Number.
      const rows = await query("SELECT serial_no FROM products");
      let maxNum = 0;
      for (const row of rows) {
        const match = row.serial_no.match(/^(?:SKU|SLIP)-([0-9]+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      }
      
      const nextNum = maxNum + 1;
      const serial_no = `SKU-${String(nextNum).padStart(3, '0')}`;

      // Insert new row
      const insertSql = `
        INSERT INTO products (serial_no, brand, type, size, color, purchase_price, selling_price, discount_percent, stock, supplier_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [serial_no, brand, type, size, color, purchase_price, selling_price, discount_percent || 0, stockVal, supplier_name || null];

      const insertResult = await query(insertSql, values);
      const newId = insertResult.insertId;

      // Log to activity_log
      db.query(
        "INSERT INTO activity_log (type, message) VALUES ('addition', ?)",
        [`Added ${stockVal} ${brand} ${type}s`],
        (logErr) => {
          if (logErr) console.error("Error writing product addition activity log:", logErr);
        }
      );

      // Write stock addition notification
      const additionMessage = `Added ${stockVal} ${brand} ${type} Size ${size} ${color}.`;
      db.query(
        "INSERT INTO notifications (type, message, product_id) VALUES ('stock_addition', ?, ?)",
        [additionMessage, newId],
        (notifErr) => {
          if (notifErr) console.error("Error writing stock addition notification:", notifErr);
        }
      );

      // Sync notifications alert
      syncProductNotifications(newId, stockVal, brand, type, size, color)
        .catch((syncErr) => console.error("Error syncing stock notifications:", syncErr));

      res.status(201).json({ message: "Product created successfully", id: newId, serial_no });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTableName = (category) => {
  if (category === "brands") return "brands";
  if (category === "types") return "product_types";
  if (category === "colors") return "colors";
  if (category === "sizes") return "sizes";
  if (category === "expense_categories") return "expense_categories";
  return null;
};

// Fetch master list items
exports.getMasterItems = async (req, res) => {
  const { category } = req.params;
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });

  try {
    let orderClause = "ORDER BY name";
    if (category === "sizes") {
      orderClause = "ORDER BY CAST(name AS UNSIGNED), name";
    }
    const results = await query(`SELECT * FROM ${table} ${orderClause}`);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add master item
exports.addMasterItem = async (req, res) => {
  const { category } = req.params;
  const { name } = req.body;
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });
  if (!name || name.trim() === "") return res.status(400).json({ error: "Item name cannot be empty" });

  try {
    const insertResult = await query(`INSERT INTO ${table} (name) VALUES (?)`, [name.trim()]);
    res.status(201).json({ id: insertResult.insertId, name: name.trim() });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: `'${name}' already exists in this master category.` });
    }
    res.status(500).json({ error: err.message });
  }
};

const getColumnName = (category) => {
  if (category === "brands") return "brand";
  if (category === "types") return "type";
  if (category === "sizes") return "size";
  if (category === "colors") return "color";
  if (category === "expense_categories") return "category";
  return null;
};

// Edit master item
exports.editMasterItem = async (req, res) => {
  const { category, id } = req.params;
  const { name } = req.body;
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });
  if (!name || name.trim() === "") return res.status(400).json({ error: "Item name cannot be empty" });

  try {
    // 1. Fetch current (old) item name
    const currentRes = await query(`SELECT name FROM ${table} WHERE id = ?`, [id]);
    if (currentRes.length === 0) {
      return res.status(404).json({ error: "Master item not found" });
    }
    const oldName = currentRes[0].name;
    const newName = name.trim();

    if (oldName !== newName) {
      const col = getColumnName(category);
      // Update master table
      await query(`UPDATE ${table} SET name = ? WHERE id = ?`, [newName, id]);
      
      // Update cascade on products and sale_items
      if (col) {
        if (category === "expense_categories") {
          await query(`UPDATE expenses SET category = ? WHERE category = ?`, [newName, oldName]);
        } else {
          await query(`UPDATE products SET ${col} = ? WHERE ${col} = ?`, [newName, oldName]);
          await query(`UPDATE sale_items SET ${col} = ? WHERE ${col} = ?`, [newName, oldName]);
        }
      }
    }
    
    res.json({ id: parseInt(id), name: newName });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: `'${name}' already exists in this master category.` });
    }
    res.status(500).json({ error: err.message });
  }
};

// Delete master item
exports.deleteMasterItem = async (req, res) => {
  const { category, id } = req.params;
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });

  try {
    // 1. Fetch item name
    const currentRes = await query(`SELECT name FROM ${table} WHERE id = ?`, [id]);
    if (currentRes.length === 0) {
      return res.status(404).json({ error: "Master item not found" });
    }
    const itemName = currentRes[0].name;
    const col = getColumnName(category);

    // 2. Check if name is currently used by products in inventory / expenses
    if (col) {
      if (category === "expense_categories") {
        const usageRes = await query("SELECT COUNT(*) AS count FROM expenses WHERE category = ?", [itemName]);
        if (usageRes[0].count > 0) {
          return res.status(400).json({ 
            error: "Cannot delete. This expense category is currently used by existing expenses." 
          });
        }
      } else {
        const usageRes = await query(`SELECT COUNT(*) AS count FROM products WHERE ${col} = ?`, [itemName]);
        if (usageRes[0].count > 0) {
          let categoryLabel = "brand";
          if (category === "types") categoryLabel = "product type";
          if (category === "sizes") categoryLabel = "size";
          if (category === "colors") categoryLabel = "color";
          return res.status(400).json({ 
            error: `Cannot delete. This ${categoryLabel} is currently used by existing products.` 
          });
        }
      }
    }

    // 3. Delete master item
    await query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    res.json({ message: "Item deleted successfully", id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all settings
exports.getSettings = async (req, res) => {
  try {
    const results = await query("SELECT * FROM settings");
    const settingsMap = {};
    results.forEach(row => {
      settingsMap[row.setting_key] = row.setting_value;
    });
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update settings
exports.saveSettings = async (req, res) => {
  const settings = req.body;
  try {
    for (const key of Object.keys(settings)) {
      await query(
        "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
        [key, String(settings[key]), String(settings[key])]
      );
    }
    res.json({ message: "Settings saved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Test SMS delivery with transient settings
exports.testSMS = async (req, res) => {
  const {
    owner_mobile,
    sms_provider,
    sms_api_key,
    sms_sender_id,
    sms_twilio_sid
  } = req.body;

  if (!owner_mobile || owner_mobile.trim() === "") {
    return res.status(400).json({ error: "Shop Owner Mobile Number is required for testing" });
  }

  // Create temporary settings object for simulated overrides
  const tempSettings = {
    owner_mobile,
    sms_provider,
    sms_api_key,
    sms_sender_id,
    sms_twilio_sid,
    sms_enabled: "true"
  };

  const message = `Test SMS Alert\n\nYour Slipper Shop ERP SMS configuration was tested successfully.`;

  try {
    const result = await sendSMS("sms_test", message, tempSettings);
    if (result.success) {
      res.json({ success: true, message: "Test SMS sent successfully!" });
    } else {
      res.status(400).json({ error: result.error || "Failed to send test SMS" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  console.log("[Auth Log] Change password request received.");
  if (!currentPassword || !newPassword) {
    console.log("[Auth Log] Failure: Current or new password missing.");
    return res.status(400).json({ error: "Current and new passwords are required" });
  }
  try {
    const currentPassRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'admin_password'");
    console.log("[Auth Log] Database settings query result:", currentPassRes);
    
    // In case no password is seeded, default to a hashed admin123
    const defaultHashed = await bcrypt.hash("admin123", 10);
    const dbPassword = currentPassRes.length > 0 ? currentPassRes[0].setting_value : defaultHashed;

    const isHashed = dbPassword.startsWith("$2a$") || dbPassword.startsWith("$2b$") || dbPassword.startsWith("$2y$");

    let match = false;
    if (isHashed) {
      match = await bcrypt.compare(currentPassword, dbPassword);
    } else {
      match = (currentPassword === dbPassword);
    }

    if (!match) {
      console.log("[Auth Log] Failure: Current password verification failed.");
      return res.status(400).json({ error: "Incorrect current password" });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('admin_password', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [hashedNewPassword, hashedNewPassword]
    );

    console.log("[Auth Log] Success: Password changed successfully.");
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.log("[Auth Log] Error: Database exception during password change:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Verify Password for Login
exports.verifyPassword = async (req, res) => {
  const { password } = req.body;
  console.log("[Auth Log] Verify password request received.");
  console.log("[Auth Log] Password received: " + password);
  if (!password) {
    console.log("[Auth Log] Failure: Password field is missing in request body.");
    return res.status(400).json({ error: "Password is required" });
  }
  try {
    const currentPassRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'admin_password'");
    console.log("[Auth Log] Database settings query result:", currentPassRes);
    
    const defaultHashed = await bcrypt.hash("admin123", 10);
    const dbPassword = currentPassRes.length > 0 ? currentPassRes[0].setting_value : defaultHashed;
    console.log("[Auth Log] Hash fetched from database: " + dbPassword);

    const isHashed = dbPassword.startsWith("$2a$") || dbPassword.startsWith("$2b$") || dbPassword.startsWith("$2y$");

    let match = false;
    if (isHashed) {
      match = await bcrypt.compare(password, dbPassword);
    } else {
      match = (password === dbPassword);
    }
    console.log("[Auth Log] bcrypt comparison result: " + match);

    if (match) {
      console.log("[Auth Log] Success: Password validation succeeded. Reason: Input matches stored credentials.");
      res.json({ success: true });
    } else {
      console.log("[Auth Log] Failure: Password validation failed. Reason: Password mismatch.");
      res.status(400).json({ error: "Incorrect password" });
    }
  } catch (err) {
    console.log("[Auth Log] Error: Database query exception: " + err.message);
    res.status(500).json({ error: err.message });
  }
};

// Reset Password back to admin123
exports.resetPassword = async (req, res) => {
  console.log("[Auth Log] Reset password request received.");
  try {
    const defaultHashed = await bcrypt.hash("admin123", 10);
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('admin_password', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [defaultHashed, defaultHashed]
    );
    console.log("[Auth Log] Success: Password reset to admin123 successfully.");
    res.json({ message: "Password reset to default (admin123) successfully!" });
  } catch (err) {
    console.log("[Auth Log] Error: Exception during password reset:", err.message);
    res.status(500).json({ error: err.message });
  }
};
