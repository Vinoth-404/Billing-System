const db = require("../config/db");
const { sendSMS } = require("../services/smsService");
const bcrypt = require("bcryptjs");
const { syncProductNotifications } = require("../services/notificationService");
const bwipjs = require("bwip-js");
const fs = require("fs");
const path = require("path");
const {
  getTimestampString,
  getFormattedDateTime,
  generateDatabaseDump,
  restoreDatabaseFromSql
} = require("../services/backupService");

// Helper to execute query with promise
const query = async (sql, params = []) => {
  const [results] = await db.query(sql, params);
  return results;
};

// Get all products
exports.getProducts = async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, 
             COALESCE(s.name, p.supplier_name) AS supplier_name,
             s.supplier_code AS supplier_code,
             p.secret_code AS secret_code,
             p.supplier_id
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.created_at DESC
    `);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single product by Serial Number
exports.getProductBySerial = async (req, res) => {
  const { serial_no } = req.params;
  try {
    const result = await query(`
      SELECT p.*, 
             COALESCE(s.name, p.supplier_name) AS supplier_name,
             s.supplier_code AS supplier_code,
             p.secret_code AS secret_code,
             p.supplier_id
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.serial_no = ?
    `, [serial_no]);
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
      query("SELECT id, name, name AS supplier_name, supplier_code, supplier_code AS code FROM suppliers ORDER BY name")
    ]);

    res.json({
      brands: brands.map(b => b.name),
      types: types.map(t => t.name),
      sizes: sizes.map(s => s.name),
      colors: colors.map(c => c.name),
      suppliers: suppliers.map(s => ({
        id: s.id,
        name: s.name,
        supplier_name: s.name,
        code: s.supplier_code,
        supplier_code: s.supplier_code
      }))
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
    const result = await query(`
      SELECT p.*,
             COALESCE(s.name, p.supplier_name) AS supplier_name,
             s.supplier_code AS supplier_code,
             p.secret_code AS secret_code,
             p.supplier_id
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.brand = ? AND p.type = ? AND p.size = ? AND p.color = ?
    `, [brand, type, size, color]);
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
    supplier_id,
    supplier_name,
    supplier_code,
    article_number,
    purchase_ref_no,
    secret_code
  } = req.body;

  let finalSupplierId = supplier_id ? parseInt(supplier_id) : null;
  let finalSupplierName = supplier_name ? supplier_name.trim() : "";
  let finalSupplierCode = supplier_code ? supplier_code.trim() : "";
  const finalSecretCode = secret_code ? secret_code.trim().toUpperCase() : "";

  // Resolve supplier details from database
  try {
    if (finalSupplierId) {
      const sRows = await query("SELECT id, name, supplier_code FROM suppliers WHERE id = ?", [finalSupplierId]);
      if (sRows.length > 0) {
        finalSupplierName = sRows[0].name;
        finalSupplierCode = sRows[0].supplier_code || "";
      }
    } else if (finalSupplierName) {
      const sRows = await query("SELECT id, name, supplier_code FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [finalSupplierName]);
      if (sRows.length > 0) {
        finalSupplierId = sRows[0].id;
        finalSupplierCode = sRows[0].supplier_code || "";
      }
    }
  } catch (supErr) {
    console.error("Error looking up supplier for addOrUpdateStock:", supErr);
  }

  if (!brand || !type || !size || !color || purchase_price === undefined || selling_price === undefined || stock === undefined || !finalSupplierName || !finalSecretCode) {
    return res.status(400).json({ error: "Please fill in all required fields (including Secret Code and Supplier Name)." });
  }

  const stockVal = parseInt(stock);
  if (isNaN(stockVal) || stockVal <= 0) {
    return res.status(400).json({ error: "Stock quantity must be a positive number." });
  }

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
        SET article_number = ?, secret_code = ?, purchase_price = ?, selling_price = ?, discount_percent = ?, stock = ?, supplier_id = ?, supplier_name = ?
        WHERE id = ?
      `;
      const values = [
        finalArticleNumber,
        finalSecretCode,
        purchase_price,
        selling_price,
        discount_percent || 0,
        newStock,
        finalSupplierId,
        finalSupplierName,
        existingProduct.id
      ];

      console.log("Executing UPDATE SQL query:", updateSql);
      console.log("Parameters array (values):", values);
      await query(updateSql, values);

      // Log to purchase_history
      const purchaseRefNo = purchase_ref_no ? purchase_ref_no.trim() : `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      await query(
        `INSERT INTO purchase_history (product_id, supplier_id, supplier_code, purchase_date, purchase_ref_no, supplier_name, article_number, secret_code, brand, type, size, color, quantity, purchase_price, total_value)
         VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          existingProduct.id,
          finalSupplierId,
          finalSupplierCode,
          purchaseRefNo,
          finalSupplierName,
          finalArticleNumber,
          finalSecretCode,
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
        [`Added ${stockVal} ${brand} ${type}s (Supplier: ${finalSupplierName})`],
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

      res.json({ 
        message: "Product stock updated successfully", 
        product: { 
          ...existingProduct, 
          stock: newStock, 
          secret_code: finalSecretCode,
          supplier_id: finalSupplierId, 
          supplier_name: finalSupplierName, 
          supplier_code: finalSupplierCode 
        } 
      });
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
        INSERT INTO products (serial_no, brand, type, size, color, purchase_price, selling_price, discount_percent, stock, supplier_id, supplier_name, article_number, secret_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        finalSupplierId, 
        finalSupplierName, 
        formattedArticleNumber,
        finalSecretCode
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
        `INSERT INTO purchase_history (product_id, supplier_id, supplier_code, purchase_date, purchase_ref_no, supplier_name, article_number, secret_code, brand, type, size, color, quantity, purchase_price, total_value)
         VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          finalSupplierId,
          finalSupplierCode,
          purchaseRefNo,
          finalSupplierName,
          formattedArticleNumber,
          finalSecretCode,
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
        [`Added ${stockVal} ${brand} ${type}s (Supplier: ${finalSupplierName})`],
        (logErr) => {
          if (logErr) console.error("Error writing stock activity log:", logErr);
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
      try {
        await syncProductNotifications(newId, stockVal, brand, type, size, color);
      } catch (syncErr) {
        console.error("Error syncing stock notifications:", syncErr);
      }

      res.status(201).json({
        message: "Product created successfully",
        id: newId,
        serial_no,
        article_number: formattedArticleNumber,
        barcode: generatedBarcode,
        secret_code: finalSecretCode,
        supplier_id: finalSupplierId,
        supplier_name: finalSupplierName,
        supplier_code: finalSupplierCode
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get single product details by Article Number or Barcode Number
exports.getProductByArticleNumber = async (req, res) => {
  const { articleNumber } = req.params;
  try {
    const results = await query(
      `SELECT p.id, p.article_number, p.brand, p.type, p.size, p.color, p.purchase_price, p.selling_price, p.stock,
              COALESCE(s.name, p.supplier_name) AS supplier,
              COALESCE(s.name, p.supplier_name) AS supplier_name,
              p.supplier_id,
              s.supplier_code AS supplier_code,
              p.secret_code AS secret_code,
              p.discount_percent, p.barcode
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.article_number = ? OR p.barcode = ?`,
      [articleNumber, articleNumber]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Product not found." });
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
  const {
    article_number,
    secret_code,
    brand,
    type,
    size,
    color,
    purchase_price,
    selling_price,
    stock,
    supplier_id,
    supplier_name,
    supplier_code
  } = req.body;

  let finalSupplierId = supplier_id ? parseInt(supplier_id) : null;
  let finalSupplierName = supplier_name ? supplier_name.trim() : "";
  let finalSupplierCode = supplier_code ? supplier_code.trim() : "";

  try {
    if (finalSupplierId) {
      const sRows = await query("SELECT id, name, supplier_code FROM suppliers WHERE id = ?", [finalSupplierId]);
      if (sRows.length > 0) {
        finalSupplierName = sRows[0].name;
        finalSupplierCode = sRows[0].supplier_code || "";
      }
    } else if (finalSupplierName) {
      const sRows = await query("SELECT id, name, supplier_code FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))", [finalSupplierName]);
      if (sRows.length > 0) {
        finalSupplierId = sRows[0].id;
        finalSupplierCode = sRows[0].supplier_code || "";
      }
    }
  } catch (sErr) {
    console.error("Error looking up supplier in editProduct:", sErr);
  }

  if (!article_number || article_number.trim() === "") {
    return res.status(400).json({ error: "Article Number is required." });
  }

  if (!secret_code || secret_code.trim() === "") {
    return res.status(400).json({ error: "Secret Code is required." });
  }

  if (!finalSupplierName) {
    return res.status(400).json({ error: "Supplier Name is required." });
  }

  const formattedArticleNumber = article_number.trim().toUpperCase();
  const formattedSecretCode = secret_code.trim().toUpperCase();

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
      SET article_number = ?, secret_code = ?, brand = ?, type = ?, size = ?, color = ?, purchase_price = ?, selling_price = ?, stock = ?, supplier_id = ?, supplier_name = ?
      WHERE id = ?
    `;
    const values = [
      formattedArticleNumber,
      formattedSecretCode,
      brand,
      type,
      size,
      color,
      purchase_price,
      selling_price,
      stock,
      finalSupplierId,
      finalSupplierName,
      id
    ];

    await query(updateSql, values);
    
    // Check if we should update references in sale_items (Cascade)
    await query("UPDATE sale_items SET article_number = ? WHERE product_id = ?", [formattedArticleNumber, id]);

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
    if (category === "suppliers") {
      const results = await query("SELECT id, name, name AS supplier_name, supplier_code, supplier_code AS code, created_at FROM suppliers ORDER BY name");
      return res.json(results);
    }
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
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });

  if (category === "suppliers") {
    const { name, supplier_name, code, supplier_code } = req.body;
    const finalName = (name || supplier_name || "").trim();
    const finalCode = (code || supplier_code || "").trim();

    if (!finalName) return res.status(400).json({ error: "Supplier Name is required." });
    if (!finalCode) return res.status(400).json({ error: "Supplier Code is required." });

    try {
      // Validate unique supplier name
      const dupName = await query("SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(?)", [finalName]);
      if (dupName.length > 0) {
        return res.status(400).json({ error: `'${finalName}' already exists as a supplier name.` });
      }

      // Validate unique supplier code
      const dupCode = await query("SELECT id FROM suppliers WHERE LOWER(TRIM(supplier_code)) = LOWER(?)", [finalCode]);
      if (dupCode.length > 0) {
        return res.status(400).json({ error: `'${finalCode}' already exists as a Supplier Code.` });
      }

      const insertResult = await query("INSERT INTO suppliers (name, supplier_code) VALUES (?, ?)", [finalName, finalCode]);
      return res.status(201).json({
        id: insertResult.insertId,
        name: finalName,
        supplier_name: finalName,
        code: finalCode,
        supplier_code: finalCode
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Supplier name or code already exists." });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  const { name } = req.body;
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
  const table = getTableName(category);
  if (!table) return res.status(400).json({ error: "Invalid master category" });

  if (category === "suppliers") {
    const { name, supplier_name, code, supplier_code } = req.body;
    const finalName = (name || supplier_name || "").trim();
    const finalCode = (code || supplier_code || "").trim();

    if (!finalName) return res.status(400).json({ error: "Supplier Name is required." });
    if (!finalCode) return res.status(400).json({ error: "Supplier Code is required." });

    try {
      const currentRes = await query("SELECT * FROM suppliers WHERE id = ?", [id]);
      if (currentRes.length === 0) {
        return res.status(404).json({ error: "Supplier not found." });
      }
      const oldSupplier = currentRes[0];

      // Check unique name
      const dupName = await query("SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ?", [finalName, id]);
      if (dupName.length > 0) {
        return res.status(400).json({ error: `'${finalName}' already exists as a supplier name.` });
      }

      // Check unique code
      const dupCode = await query("SELECT id FROM suppliers WHERE LOWER(TRIM(supplier_code)) = LOWER(?) AND id != ?", [finalCode, id]);
      if (dupCode.length > 0) {
        return res.status(400).json({ error: `'${finalCode}' already exists as a Supplier Code.` });
      }

      await query("UPDATE suppliers SET name = ?, supplier_code = ? WHERE id = ?", [finalName, finalCode, id]);

      // Cascade update to products and purchase_history
      await query("UPDATE products SET supplier_name = ? WHERE supplier_id = ? OR supplier_name = ?", [finalName, id, oldSupplier.name]);
      await query("UPDATE purchase_history SET supplier_name = ?, supplier_code = ? WHERE supplier_id = ? OR supplier_name = ?", [finalName, finalCode, id, oldSupplier.name]);

      return res.json({
        id: parseInt(id),
        name: finalName,
        supplier_name: finalName,
        code: finalCode,
        supplier_code: finalCode
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Supplier name or code already exists." });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  const { name } = req.body;
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
    const currentRes = await query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (currentRes.length === 0) {
      return res.status(404).json({ error: "Master item not found" });
    }
    const itemName = currentRes[0].name;

    if (category === "suppliers") {
      const pUsage = await query("SELECT COUNT(*) AS count FROM products WHERE supplier_id = ? OR supplier_name = ?", [id, itemName]);
      if (pUsage[0].count > 0) {
        return res.status(400).json({ 
          error: `Cannot delete. This supplier is currently used by ${pUsage[0].count} products in inventory.` 
        });
      }
      const phUsage = await query("SELECT COUNT(*) AS count FROM purchase_history WHERE supplier_id = ? OR supplier_name = ?", [id, itemName]);
      if (phUsage[0].count > 0) {
        return res.status(400).json({ 
          error: `Cannot delete. This supplier has recorded purchase history records.` 
        });
      }
      await query("DELETE FROM suppliers WHERE id = ?", [id]);
      return res.json({ message: "Supplier deleted successfully", id: parseInt(id) });
    }

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

// Supplier CRUD endpoints
exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = await query("SELECT id, name, name AS supplier_name, supplier_code, supplier_code AS code, created_at FROM suppliers ORDER BY name");
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSupplierById = async (req, res) => {
  const { id } = req.params;
  try {
    const suppliers = await query("SELECT id, name, name AS supplier_name, supplier_code, supplier_code AS code, created_at FROM suppliers WHERE id = ?", [id]);
    if (suppliers.length === 0) {
      return res.status(404).json({ error: "Supplier not found." });
    }
    res.json(suppliers[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSupplier = async (req, res) => {
  req.params.category = "suppliers";
  return exports.addMasterItem(req, res);
};

exports.updateSupplier = async (req, res) => {
  req.params.category = "suppliers";
  return exports.editMasterItem(req, res);
};

exports.deleteSupplier = async (req, res) => {
  req.params.category = "suppliers";
  return exports.deleteMasterItem(req, res);
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
      `SELECT p.id, p.serial_no, p.serial_no AS sku, p.article_number, p.brand, p.type, p.size, p.color,
              p.purchase_price, p.selling_price, p.discount_percent, p.stock,
              p.secret_code,
              COALESCE(s.name, p.supplier_name) AS supplier_name,
              s.supplier_code AS supplier_code,
              p.barcode
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.barcode = ? OR p.article_number = ?
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [barcode.trim(), barcode.trim()]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/products/article/:articleNumber
exports.getProductByArticleNumber = async (req, res) => {
  const { articleNumber } = req.params;
  try {
    const results = await query(
      `SELECT p.id, p.serial_no, p.serial_no AS sku, p.article_number, p.brand, p.type, p.size, p.color,
              p.purchase_price, p.selling_price, p.discount_percent, p.stock,
              p.secret_code,
              COALESCE(s.name, p.supplier_name) AS supplier_name,
              s.supplier_code AS supplier_code,
              p.barcode
       FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.article_number = ? OR p.serial_no = ?
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [articleNumber.trim(), articleNumber.trim()]
    );
    if (results.length === 0) {
      return res.status(404).json({ error: "Product not found." });
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
    const prod = await query(`
      SELECT p.*,
             COALESCE(s.name, p.supplier_name) AS supplier_name,
             s.supplier_code AS supplier_code,
             p.secret_code AS secret_code
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `, [id]);
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
      const prod = await query(`
        SELECT p.*,
               COALESCE(s.name, p.supplier_name) AS supplier_name,
               s.supplier_code AS supplier_code,
               p.secret_code AS secret_code
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = ?
      `, [item.id]);
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

// --- DATABASE BACKUP & RESTORE CONTROLLERS ---

// Get Backup Status
exports.getBackupStatus = async (req, res) => {
  try {
    const results = await query("SELECT * FROM settings WHERE setting_key IN ('backup_location', 'last_backup_time', 'last_backup_status', 'last_backup_file')");
    const backupSettings = {};
    results.forEach((row) => {
      backupSettings[row.setting_key] = row.setting_value;
    });

    const location = backupSettings.backup_location || "";
    let locationExists = false;
    if (location) {
      try {
        locationExists = fs.existsSync(path.normalize(location));
      } catch (e) {
        locationExists = false;
      }
    }

    res.json({
      backup_location: location,
      last_backup_time: backupSettings.last_backup_time || "Never",
      last_backup_status: backupSettings.last_backup_status || (location ? (locationExists ? "Ready" : "Folder Missing") : "Not Configured"),
      last_backup_file: backupSettings.last_backup_file || "",
      location_exists: locationExists
    });
  } catch (err) {
    console.error("[Backup] Error getting backup status:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Set / Change Backup Location
exports.setBackupLocation = async (req, res) => {
  const backupLocation = req.body?.backupLocation;
  if (!backupLocation || typeof backupLocation !== "string" || backupLocation.trim() === "") {
    return res.status(400).json({ error: "Please provide a valid backup location folder path." });
  }

  const normalizedPath = path.normalize(backupLocation.trim());

  try {
    // Check if path exists, or attempt to create directory if missing
    if (!fs.existsSync(normalizedPath)) {
      try {
        fs.mkdirSync(normalizedPath, { recursive: true });
      } catch (mkdirErr) {
        return res.status(400).json({ error: `Selected folder path does not exist and could not be created: ${mkdirErr.message}` });
      }
    }

    // Verify write permissions by writing a small test file check
    const testFile = path.join(normalizedPath, `.write_test_${Date.now()}.tmp`);
    try {
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
    } catch (writeErr) {
      return res.status(400).json({ error: "The selected folder is not writable. Please select a different folder." });
    }

    // Save to settings table
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('backup_location', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [normalizedPath, normalizedPath]
    );

    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_status', 'Configured') ON DUPLICATE KEY UPDATE setting_value = 'Configured'"
    );

    console.log(`[Backup] Location set to: ${normalizedPath}`);
    res.json({
      success: true,
      message: "Backup location saved successfully!",
      backup_location: normalizedPath
    });
  } catch (err) {
    console.error("[Backup] Error setting location:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// Create Database Backup Now
exports.createBackup = async (req, res) => {
  try {
    const reqLocation = req.body?.backupLocation;
    let location = "";

    if (reqLocation && reqLocation.trim() !== "") {
      location = path.normalize(reqLocation.trim());
    } else {
      const locRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'backup_location'");
      if (locRes.length > 0 && locRes[0].setting_value) {
        location = path.normalize(locRes[0].setting_value);
      }
    }

    if (!location || !fs.existsSync(location)) {
      return res.status(400).json({ error: "Please select a backup location before creating a backup." });
    }

    console.log("[Backup] Generating SQL dump for slipper_shop...");
    const sqlDump = await generateDatabaseDump();

    const timestampStr = getTimestampString();
    const filename = `slipper_shop_backup_${timestampStr}.sql`;
    const filePath = path.join(location, filename);

    fs.writeFileSync(filePath, sqlDump, "utf8");
    console.log(`[Backup] Backup created successfully at: ${filePath}`);

    const formattedTime = getFormattedDateTime();
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_time', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [formattedTime, formattedTime]
    );
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_status', 'Success') ON DUPLICATE KEY UPDATE setting_value = 'Success'"
    );
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_file', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [filename, filename]
    );

    res.json({
      success: true,
      message: "Database backup created successfully!",
      filename,
      backup_location: location,
      last_backup_time: formattedTime
    });
  } catch (err) {
    console.error("[Backup] Error creating backup:", err.message);
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_status', 'Failed') ON DUPLICATE KEY UPDATE setting_value = 'Failed'"
    ).catch(() => {});
    res.status(500).json({ error: `Backup failed: ${err.message}` });
  }
};

// Restore Database from Backup File
exports.restoreBackup = async (req, res) => {
  const sqlContent = req.body?.sqlContent;
  console.log("[Backup] Restore database request received.");

  if (!sqlContent || typeof sqlContent !== "string" || sqlContent.trim() === "") {
    return res.status(400).json({ error: "No SQL backup content provided for restoration." });
  }

  try {
    // 1. SAFETY STEP: Automatically create a safety backup of CURRENT database first!
    const locRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'backup_location'");
    const location = locRes.length > 0 && locRes[0].setting_value ? path.normalize(locRes[0].setting_value) : "";

    if (location && fs.existsSync(location)) {
      try {
        console.log("[Backup] Creating automatic safety backup of current database before restore...");
        const currentDump = await generateDatabaseDump();
        const safetyFilename = `slipper_shop_auto_safety_backup_${getTimestampString()}.sql`;
        fs.writeFileSync(path.join(location, safetyFilename), currentDump, "utf8");
        console.log(`[Backup] Safety backup saved as: ${safetyFilename}`);
      } catch (safetyErr) {
        console.warn("[Backup] Warning: Could not create auto safety backup before restore:", safetyErr.message);
      }
    }

    // 2. Perform Restore
    console.log("[Backup] Executing restore SQL script...");
    await restoreDatabaseFromSql(sqlContent);

    // 3. Update restore status in DB settings
    const formattedTime = getFormattedDateTime();
    await query(
      "INSERT INTO settings (setting_key, setting_value) VALUES ('last_backup_status', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
      [`Restored on ${formattedTime}`, `Restored on ${formattedTime}`]
    );

    console.log("[Backup] Database restore completed successfully!");
    res.json({
      success: true,
      message: "Database restored successfully. Please restart the application if required."
    });
  } catch (err) {
    console.error("[Backup] Restore failed:", err.message);
    res.status(500).json({ error: `Database restore failed: ${err.message}` });
  }
};

