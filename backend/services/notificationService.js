const db = require("../config/db");
const { sendSMS } = require("./smsService");

// Helper to execute query with promise
const query = async (sql, params = []) => {
  const [results] = await db.query(sql, params);
  return results;
};

/**
 * Sync active alerts (low stock/out of stock notifications) in database
 * 
 * @param {number} productId 
 * @param {number} stock 
 * @param {string} brand 
 * @param {string} type 
 * @param {string} size 
 * @param {string} color 
 */
const syncProductNotifications = async (productId, stock, brand, type, size, color) => {
  try {
    const thresholdRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'stock_threshold'");
    const threshold = thresholdRes.length > 0 ? parseInt(thresholdRes[0].setting_value, 10) : 5;

    const prodRes = await query("SELECT serial_no, supplier_name FROM products WHERE id = ?", [productId]);
    const sku = prodRes.length > 0 ? prodRes[0].serial_no : "N/A";
    const supplierName = prodRes.length > 0 ? prodRes[0].supplier_name : null;
    const supLabel = supplierName ? ` (Supplier: ${supplierName})` : "";

    const lowStockMsg = `⚠️ Low Stock Alert\nProduct: ${brand} ${type}${supLabel} ${color} Size ${size}\nSKU: ${sku}\nAvailable Stock: ${stock} pairs\nThreshold: ${threshold} pairs`;
    const outOfStockMsg = `🚫 Out of Stock\nProduct: ${brand} ${type}${supLabel} ${color} Size ${size}\nSKU: ${sku}`;

    if (stock >= threshold) {
      await query(
        "DELETE FROM notifications WHERE product_id = ? AND type IN ('low_stock', 'out_of_stock')",
        [productId]
      );
    } else if (stock > 0 && stock < threshold) {
      await query(
        "DELETE FROM notifications WHERE product_id = ? AND type = 'out_of_stock'",
        [productId]
      );
      const selRes = await query(
        "SELECT * FROM notifications WHERE product_id = ? AND type = 'low_stock'",
        [productId]
      );
      if (selRes.length > 0) {
        await query(
          "UPDATE notifications SET message = ? WHERE id = ?",
          [lowStockMsg, selRes[0].id]
        );
      } else {
        await query(
          "INSERT INTO notifications (type, message, product_id) VALUES ('low_stock', ?, ?)",
          [lowStockMsg, productId]
        );
        const smsMessage = `Low Stock Alert\n\n${brand} ${type}${supLabel}\nCurrent Stock: ${stock} pairs\n\nPlease restock soon.`;
        await sendSMS("sms_low_stock", smsMessage);
      }
    } else if (stock === 0) {
      await query(
        "DELETE FROM notifications WHERE product_id = ? AND type = 'low_stock'",
        [productId]
      );
      const selRes = await query(
        "SELECT * FROM notifications WHERE product_id = ? AND type = 'out_of_stock'",
        [productId]
      );
      if (selRes.length > 0) {
        await query(
          "UPDATE notifications SET message = ? WHERE id = ?",
          [outOfStockMsg, selRes[0].id]
        );
      } else {
        await query(
          "INSERT INTO notifications (type, message, product_id) VALUES ('out_of_stock', ?, ?)",
          [outOfStockMsg, productId]
        );
        const smsMessage = `Out Of Stock Alert\n\n${brand} ${type}${supLabel}\nCurrent Stock: 0\n\nImmediate restocking required.`;
        await sendSMS("sms_out_of_stock", smsMessage);
      }
    }
  } catch (e) {
    console.error("Error syncing product notifications:", e);
    throw e;
  }
};

/**
 * Re-evaluate all products against the current stock_threshold setting and update notifications.
 */
const resyncAllProductNotifications = async () => {
  try {
    const products = await query("SELECT * FROM products");
    for (const p of products) {
      await syncProductNotifications(p.id, p.stock, p.brand, p.type, p.size, p.color);
    }
  } catch (e) {
    console.error("Error resyncing all product notifications:", e);
  }
};

module.exports = { syncProductNotifications, resyncAllProductNotifications };
