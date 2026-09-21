const db = require("../config/db");
const { sendSMS } = require("../services/smsService");
const bcrypt = require("bcryptjs");
const { syncProductNotifications } = require("../services/notificationService");
const bwipjs = require("bwip-js");

// Helper to execute query with promise
const query = async (sql, params = []) => {
  const [results] = await db.query(sql, params);
  return results;
};

// Get all products
exports.getProducts = async (req, res) => {
  try {
    const result = await query("SELECT * FROM products ORDER BY created_at DESC");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single product by Serial Number
exports.getProductBySerial = async (req, res) => {
  const { serial_no } = req.params;
  try {
    const result = await query("SELECT * FROM products WHERE serial_no = ?", [serial_no]);
    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get unique product filters (Brand, Type, Size, Color, Supplier)
exports.getProductFilters = async (req, res) => {
  try {
    const [brands, types, sizes, colors, suppliers] = await Promise.all([
      query("SELECT name FROM brands ORDER BY name"),
      query("SELECT name FROM product_types ORDER BY name"),
      query("SELECT name FROM sizes ORDER BY CAST(name AS UNSIGNED), name"),
      query("SELECT name FROM colors ORDER BY name"),
      query("SELECT name FROM suppliers ORDER BY name")
    ]);

    res.json({
      brands: brands.map(b => b.name),
      types: types.map(t => t.name),
      sizes: sizes.map(s => s.name),
      colors: colors.map(c => c.name),
      suppliers: suppliers.map(s => s.name)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get product by attributes
exports.getProductByAttributes = async (req, res) => {
  const { brand, type, size, color } = req.query;
  if (!brand || !type || !size || !color) {
    return res.status(400).json({ error: "Missing attributes query" });
  }
  try {
    const result = await query(
      "SELECT * FROM products WHERE brand = ? AND type = ? AND size = ? AND color = ?",
      [brand, type, size, color]
    );
    if (result.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add or update stock
exports.addOrUpdateStock = async (req, res) => {
  console.log("--- addOrUpdateStock: RECEIVED REQUEST BODY ---");
  console.log(req.body);
  console.log("-----------------------------------------------");

  const {
    brand,
    type,
    size,
    color,
    purchase_price,
    selling_price,
    discount_percent,
    stock,
    supplier_name,
    article_number,
    purchase_ref_no
  } = req.body;

  if (!brand || !type || !size || !color || purchase_price === undefined || selling_price === undefined || stock === undefined || !supplier_name || supplier_name.trim() === "") {
    return res.status(400).json({ error: "Missing required fields (including Supplier Name)" });
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

      // If the article number is changing or being set for the first time, check uniqueness
      const targetArticleNumber = article_number ? article_number.trim().toUpperCase() : "";
      if (targetArticleNumber && targetArticleNumber !== existingProduct.article_number) {
        const dupCheck = await query("SELECT * FROM products WHERE article_number = ? AND id != ?", [targetArticleNumber, existingProduct.id]);
        if (dupCheck.length > 0) {
          return res.status(400).json({ error: "Article Number already exists on another product." });
        }
      }

      let finalArticleNumber = targetArticleNumber || existingProduct.article_number;
      if (!finalArticleNumber) {
        const cleanBrand = brand ? brand.trim().toUpperCase().replace(/[^A-Z]/g, "") : "ART";
        const prefix = cleanBrand.length > 3 ? cleanBrand.substring(0, 4) : (cleanBrand || "ART");
        finalArticleNumber = `${prefix}-${1000 + existingProduct.id}`;
      }

      const newStock = existingProduct.stock + stockVal;

      const updateSql = `
        UPDATE products 
        SET article_number = ?, purchase_price = ?, selling_price = ?, discount_percent = ?, stock = ?, supplier_name = ?
        WHERE id = ?
      `;
      const values = [
        finalArticleNumber,
        purchase_price,
        selling_price,
        discount_percent || 0,
        newStock,
        supplier_name || null,
        existingProduct.id
      ];

      console.log("Executing UPDATE SQL query:", updateSql);
      console.log("Parameters array (values):", values);
      await query(updateSql, values);

      // Log to purchase_history
      const purchaseRefNo = purchase_ref_no ? purchase_ref_no.trim() : `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await query(
        `INSERT INTO purchase_history (product_id, purchase_date, purchase_ref_no, supplier_name, article_number, brand, type, size, color, quantity, purchase_price, total_value)
         VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          existingProduct.id,
          purchaseRefNo,
          supplier_name,
          finalArticleNumber,
          brand,
          type,
          size,
          color,
          stockVal,
          purchase_price,
          stockVal * purchase_price
        ]
      );
      
      // Log to activity_log
      db.query(
        "INSERT INTO activity_log (type, message) VALUES ('addition', ?)",
        [`Added ${stockVal} ${brand} ${type}s (Supplier: ${supplier_name})`],
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
      // Product does not exist. Check if article number is provided and is unique
      if (!article_number || article_number.trim() === "") {
        return res.status(400).json({ error: "Article Number is required." });
      }

      const formattedArticleNumber = article_number.trim().toUpperCase();

      const existingArt = await query("SELECT * FROM products WHERE article_number = ?", [formattedArticleNumber]);
      if (existingArt.length > 0) {
        return res.status(400).json({ error: "Article Number already exists." });
      }

      // Auto-generate a new unique SKU/Serial Number using an optimized SQL query.
      const maxRow = await query(`
        SELECT MAX(CAST(SUBSTRING(serial_no, LOCATE('-', serial_no) + 1) AS UNSIGNED)) AS maxNum 
        FROM products 
        WHERE serial_no LIKE 'SKU-%' OR serial_no LIKE 'SLIP-%'
      `);
      const maxNum = maxRow[0].maxNum || 0;
      
      const nextNum = maxNum + 1;
      const serial_no = `SKU-${String(nextNum).padStart(3, '0')}`;

      const insertSql = `
        INSERT INTO products (serial_no, brand, type, size, color, purchase_price, selling_price, discount_percent, stock, supplier_name, article_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const values = [
        serial_no, 
        brand, 
        type, 
        size, 
        color, 
        purchase_price, 
        selling_price, 
        discount_percent || 0, 
        stockVal, 
        supplier_name || null, 
        formattedArticleNumber
      ];

      console.log("Executing INSERT SQL query:", insertSql);
      console.log("Parameters array (values):", values);
      const insertResult = await query(insertSql, values);
      const newId = insertResult.insertId;

      // Automatically generate a unique barcode using BC-[newId] padded
      const generatedBarcode = `BC-${String(newId).padStart(6, '0')}`;
      await query(
        "UPDATE products SET barcode = ?, barcode_generated_at = NOW() WHERE id = ?",
        [generatedBarcode, newId]
      );

      // Log to purchase_history
      const purchaseRefNo = purchase_ref_no ? purchase_ref_no.trim() : `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await query(
        `INSERT INTO purchase_history (product_id, purchase_date, purchase_ref_no, supplier_name, article_number, brand, type, size, color, quantity, purchase_price, total_value)
         VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          purchaseRefNo,
          supplier_name,
          formattedArticleNumber,
          brand,
          type,
          size,
          color,
          stockVal,
          purchase_price,
          stockVal * purchase_price
        ]
      );

      // After INSERT, immediately select to verify status of article_number in database
      const checkRow = await query("SELECT serial_no, article_number FROM products WHERE id = ?", [newId]);
      console.log("--- SELECT serial_no, article_number immediately after INSERT ---");
      console.log(checkRow[0]);
      console.log("-----------------------------------------------------------------");

      // Log to activity_log
      db.query(
        "INSERT INTO activity_log (type, message) VALUES ('addition', ?)",
        [`Added ${stockVal} ${brand} ${type}s (Supplier: ${supplier_name})`],
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

      res.status(201).json({ 
        message: "Product created successfully", 
        id: newId, 
        serial_no, 
        article_number: article_number.trim(),
        barcode: generatedBarcode
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single product details by Article Number
exports.getProductByArticleNumber = async (req, res) => {
  const { articleNumber } = req.params;
  try {
    const results = await query(
      "SELECT id, article_number, brand, type, size, color, purchase_price, selling_price, stock, supplier_name AS supplier, discount_percent, barcode FROM products WHERE article_number = ?",
      [articleNumber]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Article Number not found." });
    }
    const product = results[0];
    if (!product.barcode) {
      const generatedBarcode = `BC-${String(product.id).padStart(6, '0')}`;
      await query(
        "UPDATE products SET barcode = ?, barcode_generated_at = NOW() WHERE id = ?",
        [generatedBarcode, product.id]
      );
      product.barcode = generatedBarcode;
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Edit product details (validate article number uniqueness)
exports.editProduct = async (req, res) => {
  const { id } = req.params;
  const { article_number, brand, type, size, color, purchase_price, selling_price, stock, supplier_name } = req.body;

  if (!article_number || article_number.trim() === "") {
    return res.status(400).json({ error: "Article Number is required." });
  }

  if (!supplier_name || supplier_name.trim() === "") {
    return res.status(400).json({ error: "Supplier Name is required." });
  }

  const formattedArticleNumber = article_number.trim().toUpperCase();

  try {
    // 1. Check if another product already uses this article number
    const dupCheck = await query(
      "SELECT * FROM products WHERE article_number = ? AND id != ?",
      [formattedArticleNumber, id]
    );
    if (dupCheck.length > 0) {
      return res.status(400).json({ error: "Article Number already exists." });
    }

    // 2. Update product
    const updateSql = `
      UPDATE products 
      SET article_number = ?, brand = ?, type = ?, size = ?, color = ?, purchase_price = ?, selling_price = ?, stock = ?, supplier_name = ?
      WHERE id = ?
    `;
    const values = [
      formattedArticleNumber,
      brand,
      type,
      size,
      color,
      purchase_price,
      selling_price,
      stock,
      supplier_name || null,
      id
    ];

    await query(updateSql, values);
    
    // Log to activity_log
    db.query(
      "INSERT INTO activity_log (type, message) VALUES ('edit', ?)",
      [`Updated product ${brand} ${type} (Supplier: ${supplier_name})`],
      (logErr) => {
        if (logErr) console.error("Error writing product edit activity log:", logErr);
      }
    );
    
    // Check if we should update references in sale_items (Cascade)
    await query("UPDATE sale_items SET article_number = ? WHERE product_id = ?", [article_number.trim(), id]);

    res.json({ message: "Product updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a product by its ID
exports.deleteProduct = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Check if product is referenced in sale_items
    const salesCheck = await query("SELECT COUNT(*) AS count FROM sale_items WHERE product_id = ?", [id]);
    if (salesCheck[0].count > 0) {
      return res.status(400).json({ error: "Cannot delete this product. It has associated sales history records." });
    }

    // 2. Delete associated notifications
    await query("DELETE FROM notifications WHERE product_id = ?", [id]);

    // 3. Delete product
    const deleteResult = await query("DELETE FROM products WHERE id = ?", [id]);
    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json({ message: "Product deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTableName = (category) => {
  if (category === "brands") return "brands";
  if (category === "types") return "product_types";
  if (category === "colors") return "colors";
  if (category === "sizes") return "sizes";
  if (category === "suppliers") return "suppliers";
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
  if (category === "suppliers") return "supplier_name";
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
          if (col !== "supplier_name") {
            await query(`UPDATE sale_items SET ${col} = ? WHERE ${col} = ?`, [newName, oldName]);
          }
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
          if (category === "suppliers") categoryLabel = "supplier";
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
      if (row.setting_key === "recovery_pin") {
        settingsMap.has_recovery_pin = Boolean(row.setting_value && row.setting_value.trim() !== "");
      } else {
        settingsMap[row.setting_key] = row.setting_value;
      }
    });
    if (settingsMap.has_recovery_pin === undefined) {
      settingsMap.has_recovery_pin = false;
    }
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update settings
exports.saveSettings = async (req, res) => {
  const settings = req.body;
  console.log("[Settings] Save request received. Keys:", Object.keys(settings).join(", "));

  // Protect admin_password and recovery_pin — they cannot be changed via general settings endpoint
  const PROTECTED_KEYS = ["admin_password", "recovery_pin"];

  try {
    for (const key of Object.keys(settings)) {
      if (PROTECTED_KEYS.includes(key)) {
        console.log(`[Settings] Skipping protected key: ${key}`);
        continue;
      }
      const value = settings[key] === null || settings[key] === undefined ? "" : String(settings[key]);
      console.log(`[Settings] Saving key="${key}" value_length=${value.length}`);
      await query(
        "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
        [key, value, value]
      );
    }
    if (Object.keys(settings).includes("stock_threshold")) {
      const { resyncAllProductNotifications } = require("../services/notificationService");
      await resyncAllProductNotifications();
    }
    console.log("[Settings] All keys saved successfully.");
    res.json({ message: "Settings saved successfully" });
  } catch (err) {
    console.error("[Settings] SAVE ERROR:", err.message, err.sqlMessage || "");
    res.status(500).json({ error: err.sqlMessage || err.message || "Failed to save settings." });
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

// --- RECOVERY PIN CONTROLLERS & LOCKOUT STATE ---
let failedPinAttempts = 0;
let pinLockoutUntil = null;
const resetTokens = new Map();

// Set or Change Recovery PIN
exports.setRecoveryPin = async (req, res) => {
  const { currentPassword, recoveryPin, confirmPin } = req.body;
  console.log("[Auth Log] Set/Change Recovery PIN request received.");

  if (!currentPassword || !recoveryPin || !confirmPin) {
    return res.status(400).json({ error: "Current password, Recovery PIN, and Confirm Recovery PIN are required" });
  }

  if (recoveryPin !== confirmPin) {
    return res.status(400).json({ error: "Recovery PIN and Confirm Recovery PIN do not match" });
  }

  // Validate Recovery PIN strictly: exactly 6 digits, numbers only
  if (!/^\d{6}$/.test(recoveryPin)) {
    return res.status(400).json({ error: "Recovery PIN must be exactly 6 digits (numbers only)" });
  }

  try {
    // 1. Verify current admin password
    const currentPassRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'admin_password'");
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
      return res.status(400).json({ error: "Incorrect current admin password" });
    }

    // 2. Hash Recovery PIN using bcrypt
    const hashedPin = await bcrypt.hash(recoveryPin, 10);

    // 3. Save to database
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('recovery_pin', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [hashedPin, hashedPin]
    );

    console.log("[Auth Log] Success: Recovery PIN configured successfully.");
    res.json({ message: "Recovery PIN saved successfully!", has_recovery_pin: true });
  } catch (err) {
    console.error("[Auth Log] Error setting Recovery PIN:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Verify Recovery PIN (for Forgot Password flow)
exports.verifyRecoveryPin = async (req, res) => {
  const { pin } = req.body;
  console.log("[Auth Log] Verify Recovery PIN request received.");

  // Check 10-minute lockout state first
  if (pinLockoutUntil) {
    if (Date.now() < pinLockoutUntil) {
      const remainingSec = Math.ceil((pinLockoutUntil - Date.now()) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);
      return res.status(429).json({
        error: `Recovery PIN verification is temporarily locked for 10 minutes. Please try again in ${remainingMin} minute(s).`
      });
    } else {
      // Lockout expired, reset counters
      pinLockoutUntil = null;
      failedPinAttempts = 0;
    }
  }

  // Check if PIN is configured in DB
  try {
    const pinRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'recovery_pin'");
    if (pinRes.length === 0 || !pinRes[0].setting_value) {
      return res.status(400).json({ error: "Recovery PIN is not configured. Please contact the administrator." });
    }

    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "Recovery PIN must be exactly 6 digits" });
    }

    const storedHashedPin = pinRes[0].setting_value;
    const isHashed = storedHashedPin.startsWith("$2a$") || storedHashedPin.startsWith("$2b$") || storedHashedPin.startsWith("$2y$");

    let match = false;
    if (isHashed) {
      match = await bcrypt.compare(pin, storedHashedPin);
    } else {
      match = (pin === storedHashedPin);
    }

    if (!match) {
      failedPinAttempts += 1;
      if (failedPinAttempts >= 5) {
        pinLockoutUntil = Date.now() + 10 * 60 * 1000; // 10 minutes from now
        return res.status(429).json({
          error: "Maximum incorrect Recovery PIN attempts reached. Recovery PIN verification is temporarily locked for 10 minutes."
        });
      }
      const attemptsLeft = 5 - failedPinAttempts;
      return res.status(400).json({
        error: `Incorrect Recovery PIN. ${attemptsLeft} attempt(s) remaining before temporary lockout.`
      });
    }

    // Success: reset failure counter and clear lockout
    failedPinAttempts = 0;
    pinLockoutUntil = null;

    // Generate single-use resetToken (valid for 15 minutes)
    const resetToken = require("crypto").randomBytes(16).toString("hex");
    resetTokens.set(resetToken, Date.now() + 15 * 60 * 1000);

    console.log("[Auth Log] Success: Recovery PIN verified successfully.");
    res.json({ success: true, message: "Recovery PIN verified successfully", resetToken });
  } catch (err) {
    console.error("[Auth Log] Error verifying Recovery PIN:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Reset Password using verified Recovery PIN session token
exports.resetPasswordWithPin = async (req, res) => {
  const { resetToken, newPassword, confirmPassword } = req.body;
  console.log("[Auth Log] Reset password with PIN request received.");

  if (!resetToken || !resetTokens.has(resetToken)) {
    return res.status(400).json({ error: "Invalid or expired password reset session. Please verify Recovery PIN again." });
  }

  const expiry = resetTokens.get(resetToken);
  if (Date.now() > expiry) {
    resetTokens.delete(resetToken);
    return res.status(400).json({ error: "Password reset session has expired. Please verify Recovery PIN again." });
  }

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: "New password and confirm password are required" });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirm password do not match" });
  }

  if (newPassword.trim() === "") {
    return res.status(400).json({ error: "Password cannot be blank" });
  }

  try {
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('admin_password', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [hashedNewPassword, hashedNewPassword]
    );

    // Invalidate resetToken so it cannot be reused
    resetTokens.delete(resetToken);

    console.log("[Auth Log] Success: Password reset via Recovery PIN completed successfully.");
    res.json({ success: true, message: "Password updated successfully. Please log in with your new password." });
  } catch (err) {
    console.error("[Auth Log] Error resetting password with PIN:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Get all activity logs with filters
exports.getActivityLogs = async (req, res) => {
  const { startDate, endDate, search } = req.query;
  let whereClause = "";
  const params = [];

  if (startDate && endDate) {
    whereClause = "WHERE created_at BETWEEN ? AND ?";
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  if (search && search.trim() !== "") {
    const searchVal = `%${search.trim()}%`;
    if (whereClause === "") {
      whereClause = "WHERE (message LIKE ? OR type LIKE ?)";
    } else {
      whereClause += " AND (message LIKE ? OR type LIKE ?)";
    }
    params.push(searchVal, searchVal);
  }

  try {
    const results = await query(`SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC`, params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Helper to generate Code-128 barcode as a base64 PNG data URL
const generateBarcodeDataUrl = async (text) => {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: "code128",
        text: text,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      },
      (err, pngBuffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(`data:image/png;base64,${pngBuffer.toString("base64")}`);
        }
      }
    );
  });
};

// GET /api/products/barcode/:barcode
exports.getProductByBarcode = async (req, res) => {
  const { barcode } = req.params;
  try {
    const results = await query(
      "SELECT id, serial_no, serial_no AS sku, article_number, brand, type, size, color, purchase_price, selling_price, discount_percent, stock, supplier_name, supplier_name AS supplier, barcode FROM products WHERE barcode = ?",
      [barcode]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Product with this barcode not found." });
    }
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/barcode/generate/:id
exports.regenerateBarcode = async (req, res) => {
  const { id } = req.params;
  try {
    const prod = await query("SELECT * FROM products WHERE id = ?", [id]);
    if (prod.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }
    // Generate a barcode using ID and timestamp to guarantee absolute uniqueness
    const newBarcode = `BC-${id}-${Date.now().toString().slice(-4)}`;
    await query(
      "UPDATE products SET barcode = ?, barcode_generated_at = NOW() WHERE id = ?",
      [newBarcode, id]
    );
    res.json({ message: "Barcode regenerated successfully", barcode: newBarcode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/barcode/print/:id
exports.printBarcode = async (req, res) => {
  const { id } = req.params;
  const { copies = 1 } = req.body;
  try {
    const prod = await query("SELECT * FROM products WHERE id = ?", [id]);
    if (prod.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }
    const p = prod[0];
    if (!p.barcode) {
      return res.status(400).json({ error: "Product does not have a barcode generated." });
    }
    const barcodeDataUrl = await generateBarcodeDataUrl(p.barcode);
    res.json({
      product: p,
      barcodeDataUrl,
      copies
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/barcode/print-all
exports.printAllBarcodes = async (req, res) => {
  const { products } = req.body; // Array of { id, copies }
  try {
    const list = products || [];
    const results = [];
    for (const item of list) {
      const prod = await query("SELECT * FROM products WHERE id = ?", [item.id]);
      if (prod.length > 0) {
        const p = prod[0];
        if (p.barcode) {
          try {
            const barcodeDataUrl = await generateBarcodeDataUrl(p.barcode);
            results.push({
              product: p,
              barcodeDataUrl,
              copies: item.copies || 1
            });
          } catch (barErr) {
            console.error(`Error generating barcode for ID ${p.id}:`, barErr);
          }
        }
      }
    }
    res.json({ labels: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/barcode/image/:barcode
exports.getBarcodeImage = async (req, res) => {
  const { barcode } = req.params;
  try {
    bwipjs.toBuffer(
      {
        bcid: "code128",
        text: barcode,
        scale: 2,
        height: 8,
        includetext: false
      },
      (err, pngBuffer) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.set("Content-Type", "image/png");
          res.send(pngBuffer);
        }
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/barcode/generate-missing
exports.generateMissingBarcodes = async (req, res) => {
  try {
    const products = await query("SELECT id FROM products WHERE barcode IS NULL OR barcode = ''");
    let count = 0;
    for (const prod of products) {
      const barcode = `BC-${prod.id}-${Date.now().toString().slice(-4)}`;
      await query(
        "UPDATE products SET barcode = ?, barcode_generated_at = NOW() WHERE id = ?",
        [barcode, prod.id]
      );
      count++;
    }
    res.json({ message: `Successfully generated barcodes for ${count} products.`, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

