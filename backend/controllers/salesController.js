const db = require("../config/db");
const { sendSMS } = require("../services/smsService");

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

// Record a new sale transaction (POS Checkout)
exports.recordSale = async (req, res) => {
  const {
    bill_no,
    discount,
    gst,
    total_price,
    total_profit,
    payment_method,
    items,
    customer_name,
    customer_phone
  } = req.body;

  if (!bill_no || !payment_method || !items || items.length === 0) {
    return res.status(400).json({ error: "Missing required billing details" });
  }

  // Start Transaction
  db.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({ error: "Transaction start failed" });
    }

    try {
      // 1. Insert Sale record
      const date = new Date();
      const saleResult = await query(
        "INSERT INTO sales (bill_no, date, discount, gst, total_price, total_profit, payment_method, customer_name, customer_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          bill_no,
          date,
          discount || 0,
          gst || 0,
          total_price,
          total_profit,
          payment_method,
          customer_name ? customer_name.trim() : "Walk-in Customer",
          customer_phone ? customer_phone.trim() : null
        ]
      );
      const saleId = saleResult.insertId;

      // 2. Loop items to save item details and reduce inventory stock
      for (const item of items) {
        // Double check product stock availability
        const prod = await query("SELECT stock, purchase_price, selling_price, brand, type, size, color FROM products WHERE id = ?", [item.product_id]);
        if (prod.length === 0) {
          throw new Error(`Product ${item.serial_no} not found`);
        }
        
        const currentStock = prod[0].stock;
        if (currentStock < item.quantity) {
          throw new Error(`Insufficient stock for ${prod[0].brand} ${prod[0].type}. Available: ${currentStock}, Requested: ${item.quantity}`);
        }

        // Insert into sale_items
        await query(
          "INSERT INTO sale_items (sale_id, product_id, brand, type, size, color, quantity, purchase_price, selling_price, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [saleId, item.product_id, item.brand, item.type, item.size, item.color, item.quantity, item.purchase_price, item.selling_price, item.profit]
        );

        const newStock = currentStock - item.quantity;

        // Decrement stock
        await query(
          "UPDATE products SET stock = ? WHERE id = ?",
          [newStock, item.product_id]
        );

        // Log to activity_log
        await query(
          "INSERT INTO activity_log (type, message) VALUES ('sale', ?)",
          [`Sold ${item.quantity} ${item.brand} ${item.type}s`]
        );

        // Sync alerts notifications
        await syncProductNotifications(item.product_id, newStock, item.brand, item.type, item.size, item.color);
      }

      // Commit Transaction
      db.commit(async (commitErr) => {
        if (commitErr) {
          return db.rollback(() => res.status(500).json({ error: "Commit failed" }));
        }

        // Trigger SMS notification
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const smsMessage = `Shop Sale Alert\n\nInvoice No: ${bill_no}\nCustomer: ${customer_name || "Walk-in Customer"}\nAmount: ₹${total_price.toFixed(2)}\nPayment: ${payment_method}\nItems Sold: ${totalItems}\n\nSale completed successfully.`;
        
        let smsWarning = false;
        try {
          const smsResult = await sendSMS("sms_sale", smsMessage);
          smsWarning = !smsResult.success;
        } catch (smsErr) {
          console.error("SMS notification trigger failed during sale:", smsErr);
          smsWarning = true;
        }

        res.status(201).json({ message: "Sale recorded successfully", saleId, bill_no, smsWarning });
      });

    } catch (error) {
      // Rollback on any failure
      db.rollback(() => {
        res.status(500).json({ error: error.message || "Sale recording failed" });
      });
    }
  });
};

// Fetch sales items history with filters
exports.getSalesItemsHistory = async (req, res) => {
  const { filter, startDate, endDate } = req.query;
  let dateCondition = "";
  const params = [];

  if (filter === "today") {
    dateCondition = "WHERE DATE(s.date) = CURDATE()";
  } else if (filter === "yesterday") {
    dateCondition = "WHERE DATE(s.date) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
  } else if (filter === "week") {
    dateCondition = "WHERE s.date >= DATE_SUB(NOW(), INTERVAL 7 DAY)";
  } else if (filter === "month") {
    dateCondition = "WHERE s.date >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
  } else if (filter === "custom" && startDate && endDate) {
    dateCondition = "WHERE s.date BETWEEN ? AND ?";
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  try {
    const statsSql = `
      SELECT 
        COALESCE(SUM(s.total_price), 0) AS totalRevenue,
        COALESCE(SUM(s.total_profit), 0) AS totalProfit,
        COUNT(DISTINCT s.id) AS totalSales
      FROM sales s
      ${dateCondition}
    `;
    const periodStats = await query(statsSql, params);

    const listSql = `
      SELECT 
        s.bill_no,
        s.date,
        s.payment_method,
        s.customer_name,
        s.customer_phone,
        s.total_price AS total_amount
      FROM sales s
      ${dateCondition}
      ORDER BY s.date DESC
    `;
    const records = await query(listSql, params);

    res.json({
      stats: {
        totalSales: periodStats[0].totalSales,
        totalRevenue: periodStats[0].totalRevenue,
        totalProfit: periodStats[0].totalProfit,
        totalLoss: 0
      },
      records
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch Dashboard Analytics (Redesigned)
exports.getDashboardStats = async (req, res) => {
  try {
    const thresholdRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'stock_threshold'");
    const threshold = thresholdRes.length > 0 ? parseInt(thresholdRes[0].setting_value, 10) : 5;

    // 1. KPI Counts
    const totalProductsRes = await query("SELECT COUNT(*) AS count FROM products");
    const availableStockRes = await query("SELECT COALESCE(SUM(stock), 0) AS count FROM products");
    const soldTodayRes = await query(`
      SELECT COALESCE(SUM(si.quantity), 0) AS count 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id 
      WHERE DATE(s.date) = CURDATE()
    `);
    const soldThisMonthRes = await query(`
      SELECT COALESCE(SUM(si.quantity), 0) AS count 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id 
      WHERE MONTH(s.date) = MONTH(CURDATE()) AND YEAR(s.date) = YEAR(CURDATE())
    `);
    const lowStockCountRes = await query("SELECT COUNT(*) AS count FROM products WHERE stock > 0 AND stock <= ?", [threshold]);
    const outOfStockCountRes = await query("SELECT COUNT(*) AS count FROM products WHERE stock = 0");

    // 2. Today's Sales List
    const todaySalesList = await query(`
      SELECT p.serial_no, p.brand, p.type, SUM(si.quantity) AS qty_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE DATE(s.date) = CURDATE()
      GROUP BY p.id
      ORDER BY qty_sold DESC
    `);

    // 3. Monthly Sales List
    const monthlySalesList = await query(`
      SELECT p.brand, p.type, SUM(si.quantity) AS qty_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE MONTH(s.date) = MONTH(CURDATE()) AND YEAR(s.date) = YEAR(CURDATE())
      GROUP BY p.brand, p.type
      ORDER BY qty_sold DESC
    `);

    // 4. Recent Activity Logs (last 10 items)
    const recentActivities = await query(`
      SELECT id, type, message, created_at 
      FROM activity_log 
      ORDER BY created_at DESC, id DESC 
      LIMIT 10
    `);

    // 5. Warnings lists
    const lowStockList = await query("SELECT * FROM products WHERE stock > 0 AND stock <= ? ORDER BY stock ASC", [threshold]);
    const outOfStockList = await query("SELECT * FROM products WHERE stock = 0 ORDER BY brand, type");

    res.json({
      kpis: {
        totalProducts: totalProductsRes[0].count,
        availableStock: availableStockRes[0].count,
        soldToday: soldTodayRes[0].count,
        soldThisMonth: soldThisMonthRes[0].count,
        lowStockCount: lowStockCountRes[0].count,
        outOfStockCount: outOfStockCountRes[0].count
      },
      todaySalesList,
      monthlySalesList,
      recentActivities,
      lowStock: lowStockList,
      outOfStock: outOfStockList,
      alerts: {
        lowStock: lowStockList,
        outOfStock: outOfStockList
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Generate reports brand-wise summary (Redesigned Report Calculations)
exports.getReportsSummary = async (req, res) => {
  const { startDate, endDate, brand, type, size, color, customer_name, customer_phone } = req.query;

  // Build filters for products
  let productSql = "SELECT brand, type, size, color, stock, purchase_price, selling_price FROM products WHERE 1=1";
  const productParams = [];
  if (brand) { productSql += " AND brand = ?"; productParams.push(brand); }
  if (type) { productSql += " AND type = ?"; productParams.push(type); }
  if (size) { productSql += " AND size = ?"; productParams.push(size); }
  if (color) { productSql += " AND color = ?"; productParams.push(color); }

  // Build filters for sales
  let saleItemsSql = `
    SELECT si.brand, si.type, si.size, si.color, si.quantity, si.purchase_price, si.selling_price
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE 1=1
  `;
  const saleItemsParams = [];
  if (brand) { saleItemsSql += " AND si.brand = ?"; saleItemsParams.push(brand); }
  if (type) { saleItemsSql += " AND si.type = ?"; saleItemsParams.push(type); }
  if (size) { saleItemsSql += " AND si.size = ?"; saleItemsParams.push(size); }
  if (color) { saleItemsSql += " AND si.color = ?"; saleItemsParams.push(color); }
  if (customer_name) { saleItemsSql += " AND s.customer_name LIKE ?"; saleItemsParams.push(`%${customer_name}%`); }
  if (customer_phone) { saleItemsSql += " AND s.customer_phone LIKE ?"; saleItemsParams.push(`%${customer_phone}%`); }
  if (startDate && endDate) {
    saleItemsSql += " AND s.date BETWEEN ? AND ?";
    saleItemsParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  // Build filters for activity log additions (only when date range is set)
  let activitySql = "SELECT message, created_at FROM activity_log WHERE type = 'addition'";
  const activityParams = [];
  if (startDate && endDate) {
    activitySql += " AND created_at BETWEEN ? AND ?";
    activityParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
  }

  try {
    const [products, saleItems, additionLogs] = await Promise.all([
      query(productSql, productParams),
      query(saleItemsSql, saleItemsParams),
      (startDate && endDate) ? query(activitySql, activityParams) : Promise.resolve([])
    ]);

    const brandSummary = {};

    // Group products by brand and sum availableStock
    products.forEach((p) => {
      const b = p.brand;
      if (!brandSummary[b]) {
        brandSummary[b] = {
          brand: b,
          purchasedQty: 0,
          soldQty: 0,
          availableStock: 0,
          purchaseCost: 0, // COGS = sum(purchase_price * sold_quantity)
          salesAmount: 0,
          profit: 0,
          loss: 0
        };
      }
      if (!customer_name && !customer_phone) {
        brandSummary[b].availableStock += Number(p.stock);
      }
    });

    // Process sales items (Sold Qty, Sales Amount, Purchase Cost COGS)
    saleItems.forEach((item) => {
      const b = item.brand;
      if (!brandSummary[b]) {
        brandSummary[b] = {
          brand: b,
          purchasedQty: 0,
          soldQty: 0,
          availableStock: 0,
          purchaseCost: 0,
          salesAmount: 0,
          profit: 0,
          loss: 0
        };
      }
      
      const qty = Number(item.quantity);
      const selling = Number(item.selling_price) * qty;
      const cost = Number(item.purchase_price) * qty;

      brandSummary[b].soldQty += qty;
      brandSummary[b].salesAmount += selling;
      brandSummary[b].purchaseCost += cost;
    });

    // Calculate Purchased Qty based on date filters or lifetime
    if (startDate && endDate && !customer_name && !customer_phone) {
      additionLogs.forEach((log) => {
        const match = log.message.match(/Added (\d+) (\w+)/);
        if (match) {
          const qty = parseInt(match[1]);
          const brandName = match[2];

          if (brand && brand !== brandName) return;

          if (!brandSummary[brandName]) {
            brandSummary[brandName] = {
              brand: brandName,
              purchasedQty: 0,
              soldQty: 0,
              availableStock: 0,
              purchaseCost: 0,
              salesAmount: 0,
              profit: 0,
              loss: 0
            };
          }
          brandSummary[brandName].purchasedQty += qty;
        }
      });
    } else {
      // Lifetime: Purchased Qty = Available Stock + Sold Qty
      Object.keys(brandSummary).forEach((b) => {
        brandSummary[b].purchasedQty = brandSummary[b].availableStock + brandSummary[b].soldQty;
      });
    }

    // Process final Profit and Loss calculations brand-wise
    Object.keys(brandSummary).forEach((b) => {
      const sum = brandSummary[b];
      const sales = sum.salesAmount;
      const cost = sum.purchaseCost;

      sum.profit = Math.max(sales - cost, 0);
      sum.loss = Math.max(cost - sales, 0);
    });

    const finalReportRows = Object.values(brandSummary);

    // Sum overall aggregates from brand-wise row totals
    const totalSales = finalReportRows.reduce((sum, r) => sum + r.salesAmount, 0);
    const totalPurchase = finalReportRows.reduce((sum, r) => sum + r.purchaseCost, 0);
    
    // Verifiable Profit and Loss calculation
    const totalProfit = Math.max(totalSales - totalPurchase, 0);
    const totalLoss = Math.max(totalPurchase - totalSales, 0);

    res.json({
      totals: {
        totalPurchaseCost: totalPurchase,
        totalSalesAmount: totalSales,
        totalProfit: totalProfit,
        totalLoss: totalLoss
      },
      rows: finalReportRows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Generate reports statements (Legacy period summaries, retained for fallback compatibility)
exports.getReportsData = async (req, res) => {
  const { type } = req.query;
  let intervalCondition = "";
  
  if (type === "daily") {
    intervalCondition = "WHERE s.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
  } else if (type === "weekly") {
    intervalCondition = "WHERE s.date >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK)";
  } else if (type === "monthly") {
    intervalCondition = "WHERE s.date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)";
  } else {
    intervalCondition = "WHERE s.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
  }

  try {
    let sql = "";
    if (type === "daily") {
      sql = `
        SELECT 
          DATE_FORMAT(s.date, '%Y-%m-%d') AS period,
          COUNT(DISTINCT s.id) AS sales_count,
          SUM(s.total_price) AS revenue,
          SUM(s.total_profit) AS profit,
          SUM(si.purchase_price * si.quantity) AS expenses
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        ${intervalCondition}
        GROUP BY DATE_FORMAT(s.date, '%Y-%m-%d')
        ORDER BY period DESC
      `;
    } else if (type === "weekly") {
      sql = `
        SELECT 
          CONCAT('Week ', WEEK(s.date), ', ', YEAR(s.date)) AS period,
          COUNT(DISTINCT s.id) AS sales_count,
          SUM(s.total_price) AS revenue,
          SUM(s.total_profit) AS profit,
          SUM(si.purchase_price * si.quantity) AS expenses
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        ${intervalCondition}
        GROUP BY YEAR(s.date), WEEK(s.date)
        ORDER BY YEAR(s.date) DESC, WEEK(s.date) DESC
      `;
    } else {
      sql = `
        SELECT 
          DATE_FORMAT(s.date, '%M %Y') AS period,
          COUNT(DISTINCT s.id) AS sales_count,
          SUM(s.total_price) AS revenue,
          SUM(s.total_profit) AS profit,
          SUM(si.purchase_price * si.quantity) AS expenses
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        ${intervalCondition}
        GROUP BY YEAR(s.date), MONTH(s.date)
        ORDER BY YEAR(s.date) DESC, MONTH(s.date) DESC
      `;
    }

    const reportLines = await query(sql);
    res.json(reportLines);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fetch notifications list
exports.getNotifications = async (req, res) => {
  try {
    // 1. Fetch threshold
    const thresholdRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'stock_threshold'");
    const threshold = thresholdRes.length > 0 ? parseInt(thresholdRes[0].setting_value, 10) : 5;

    // 2. Fetch products that are low stock or out of stock
    const products = await query(`
      SELECT id, serial_no, brand, type, size, color, stock, created_at 
      FROM products 
      WHERE stock = 0 OR (stock > 0 AND stock <= ?)
      ORDER BY stock ASC, created_at DESC
    `, [threshold]);

    // 3. Map to notification-like objects dynamically
    const notifications = products.map((prod) => {
      const isOutOfStock = prod.stock === 0;
      const type = isOutOfStock ? "out_of_stock" : "low_stock";
      const timestamp = prod.created_at || new Date();
      
      const message = isOutOfStock
        ? `🚫 Out of Stock\nProduct: ${prod.brand} ${prod.type} ${prod.color} Size ${prod.size}\nSKU: ${prod.serial_no}`
        : `⚠️ Low Stock Alert\nProduct: ${prod.brand} ${prod.type} ${prod.color} Size ${prod.size}\nSKU: ${prod.serial_no}\nAvailable Stock: ${prod.stock} pairs\nThreshold: ${threshold} pairs`;

      return {
        id: `dyn-${prod.id}-${type}`,
        type,
        message,
        product_id: prod.id,
        created_at: timestamp
      };
    });

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
