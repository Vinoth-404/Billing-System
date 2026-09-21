const db = require("../config/db");
const { sendSMS } = require("../services/smsService");
const { syncProductNotifications } = require("../services/notificationService");

// Helper to execute query with promise
const query = async (sql, params = []) => {
  const [results] = await db.query(sql, params);
  return results;
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

  // ── Backend customer field validation ───────────────────────────────────────
  const CUSTOMER_NAME_REGEX = /^[A-Za-z ]+$/;
  const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

  if (customer_name && customer_name.trim() !== "") {
    const trimmedName = customer_name.trim();
    if (!CUSTOMER_NAME_REGEX.test(trimmedName)) {
      return res.status(400).json({ error: "Customer name can contain letters and spaces only." });
    }
  }

  if (customer_phone && customer_phone.trim() !== "") {
    const trimmedPhone = customer_phone.trim();
    if (!INDIAN_MOBILE_REGEX.test(trimmedPhone)) {
      return res.status(400).json({ error: "Enter a valid 10-digit mobile number." });
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Insert Sale record
    const date = new Date();
    const [saleResult] = await conn.query(
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
      // Double check product stock availability with row lock
      const [prod] = await conn.query(
        "SELECT stock, purchase_price, selling_price, brand, type, size, color, article_number FROM products WHERE id = ? FOR UPDATE",
        [item.product_id]
      );
      if (prod.length === 0) {
        throw new Error(`Product ID ${item.product_id} not found`);
      }
      
      const currentStock = prod[0].stock;
      if (currentStock < item.quantity) {
        throw new Error(`Insufficient stock for ${prod[0].brand} ${prod[0].type}. Available: ${currentStock}, Requested: ${item.quantity}`);
      }

      const articleNumber = item.article_number || prod[0].article_number;

      // Insert into sale_items
      await conn.query(
        "INSERT INTO sale_items (sale_id, product_id, article_number, brand, type, size, color, quantity, purchase_price, selling_price, profit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          saleId,
          item.product_id,
          articleNumber,
          item.brand,
          item.type,
          item.size,
          item.color,
          item.quantity,
          item.purchase_price,
          item.selling_price,
          item.profit
        ]
      );

      const newStock = currentStock - item.quantity;

      // Decrement stock
      await conn.query(
        "UPDATE products SET stock = ? WHERE id = ?",
        [newStock, item.product_id]
      );

      // Log to activity_log
      await conn.query(
        "INSERT INTO activity_log (type, message) VALUES ('sale', ?)",
        [`Sold ${item.quantity} ${item.brand} ${item.type}s`]
      );
    }

    await conn.commit();

    // Respond to POS client IMMEDIATELY post-commit for fast response
    res.status(201).json({ message: "Sale recorded successfully", saleId, bill_no });

    // Sync alerts notifications and trigger SMS asynchronously in background
    (async () => {
      try {
        await Promise.all(items.map(async (item) => {
          const [prodRow] = await db.query("SELECT stock FROM products WHERE id = ?", [item.product_id]);
          const newStock = prodRow.length > 0 ? prodRow[0].stock : 0;
          await syncProductNotifications(item.product_id, newStock, item.brand, item.type, item.size, item.color);
        }));

        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const smsMessage = `Shop Sale Alert\n\nInvoice No: ${bill_no}\nCustomer: ${customer_name || "Walk-in Customer"}\nAmount: ₹${Number(total_price).toFixed(2)}\nPayment: ${payment_method}\nItems Sold: ${totalItems}\n\nSale completed successfully.`;
        await sendSMS("sms_sale", smsMessage);
      } catch (asyncErr) {
        console.error("Background notification/SMS error after sale:", asyncErr);
      }
    })();

  } catch (error) {
    await conn.rollback();
    res.status(500).json({ error: error.message || "Sale recording failed" });
  } finally {
    conn.release();
  }
};

// Fetch sales items history with filters
exports.getSalesItemsHistory = async (req, res) => {
  const { filter, startDate, endDate, search } = req.query;
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

  let whereClause = dateCondition;

  if (search && search.trim() !== "") {
    const searchVal = `%${search.trim()}%`;
    if (whereClause === "") {
      whereClause = "WHERE (s.bill_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE article_number LIKE ?))";
    } else {
      whereClause += " AND (s.bill_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE article_number LIKE ?))";
    }
    params.push(searchVal, searchVal, searchVal, searchVal);
  }

  try {
    const statsSql = `
      SELECT 
        COALESCE(SUM(s.total_price), 0) AS totalRevenue,
        COALESCE(SUM(s.total_profit), 0) AS totalProfit,
        COUNT(DISTINCT s.id) AS totalSales
      FROM sales s
      ${whereClause}
    `;
    const periodStats = await query(statsSql, params);

    const listSql = `
      SELECT 
        s.bill_no,
        s.date,
        s.payment_method,
        s.customer_name,
        s.customer_phone,
        s.total_price AS total_amount,
        GROUP_CONCAT(DISTINCT si.article_number SEPARATOR ', ') AS article_numbers
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${whereClause}
      GROUP BY s.id
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

// Fetch Dashboard Analytics (Redesigned with parallel query execution)
exports.getDashboardStats = async (req, res) => {
  try {
    const thresholdRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'stock_threshold'");
    const threshold = thresholdRes.length > 0 ? parseInt(thresholdRes[0].setting_value, 10) : 5;

    // Run remaining database queries concurrently
    const [
      totalProductsRes,
      availableStockRes,
      soldTodayRes,
      soldThisMonthRes,
      todaySalesList,
      monthlySalesList,
      recentActivities,
      lowStockList,
      outOfStockList,
      supplierSummary
    ] = await Promise.all([
      query("SELECT COUNT(*) AS count FROM products"),
      query("SELECT COALESCE(SUM(stock), 0) AS count FROM products"),
      query(`
        SELECT COALESCE(SUM(si.quantity), 0) AS count 
        FROM sale_items si 
        JOIN sales s ON si.sale_id = s.id 
        WHERE DATE(s.date) = CURDATE()
      `),
      query(`
        SELECT COALESCE(SUM(si.quantity), 0) AS count 
        FROM sale_items si 
        JOIN sales s ON si.sale_id = s.id 
        WHERE MONTH(s.date) = MONTH(CURDATE()) AND YEAR(s.date) = YEAR(CURDATE())
      `),
      query(`
        SELECT p.serial_no, p.brand, p.type, SUM(si.quantity) AS qty_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE DATE(s.date) = CURDATE()
        GROUP BY p.id
        ORDER BY qty_sold DESC
      `),
      query(`
        SELECT p.brand, p.type, SUM(si.quantity) AS qty_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE MONTH(s.date) = MONTH(CURDATE()) AND YEAR(s.date) = YEAR(CURDATE())
        GROUP BY p.brand, p.type
        ORDER BY qty_sold DESC
      `),
      query(`
        SELECT id, type, message, created_at 
        FROM activity_log 
        ORDER BY created_at DESC, id DESC 
        LIMIT 10
      `),
      query("SELECT * FROM products WHERE stock > 0 AND stock < ? ORDER BY stock ASC", [threshold]),
      query("SELECT * FROM products WHERE stock = 0 ORDER BY brand, type"),
      query(`
        SELECT 
          COALESCE(supplier_name, 'No Supplier') AS supplier_name,
          COUNT(*) AS total_products,
          COALESCE(SUM(stock), 0) AS total_stock,
          COALESCE(SUM(stock * purchase_price), 0.00) AS stock_value,
          COALESCE(SUM(CASE WHEN stock > 0 AND stock < ? THEN 1 ELSE 0 END), 0) AS low_stock_count
        FROM products
        GROUP BY supplier_name
        ORDER BY total_stock DESC
      `, [threshold])
    ]);

    res.json({
      kpis: {
        totalProducts: totalProductsRes[0].count,
        availableStock: availableStockRes[0].count,
        soldToday: soldTodayRes[0].count,
        soldThisMonth: soldThisMonthRes[0].count,
        lowStockCount: lowStockList.length,
        outOfStockCount: outOfStockList.length
      },
      todaySalesList,
      monthlySalesList,
      recentActivities,
      lowStock: lowStockList,
      outOfStock: outOfStockList,
      alerts: {
        lowStock: lowStockList,
        outOfStock: outOfStockList
      },
      supplierSummary
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
      SELECT id, serial_no, brand, type, size, color, stock, supplier_name, created_at 
      FROM products 
      WHERE stock = 0 OR (stock > 0 AND stock < ?)
      ORDER BY stock ASC, created_at DESC
    `, [threshold]);

    // 3. Map to notification-like objects dynamically
    const notifications = products.map((prod) => {
      const isOutOfStock = prod.stock === 0;
      const type = isOutOfStock ? "out_of_stock" : "low_stock";
      const timestamp = prod.created_at || new Date();
      const supLabel = prod.supplier_name ? ` (Supplier: ${prod.supplier_name})` : "";
      
      const message = isOutOfStock
        ? `🚫 Out of Stock\nProduct: ${prod.brand} ${prod.type}${supLabel} ${prod.color} Size ${prod.size}\nSKU: ${prod.serial_no}`
        : `⚠️ Low Stock Alert\nProduct: ${prod.brand} ${prod.type}${supLabel} ${prod.color} Size ${prod.size}\nSKU: ${prod.serial_no}\nAvailable Stock: ${prod.stock} pairs\nThreshold: ${threshold} pairs`;

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

// Generate reports supplier-wise summary (Supplier reports)
exports.getSupplierReports = async (req, res) => {
  const { startDate, endDate, supplier } = req.query;

  // Build filters for products
  let productSql = "SELECT supplier_name, stock, purchase_price, selling_price FROM products WHERE 1=1";
  const productParams = [];
  if (supplier) { productSql += " AND supplier_name = ?"; productParams.push(supplier); }

  // Build filters for sales
  let saleItemsSql = `
    SELECT p.supplier_name, si.quantity, si.purchase_price, si.selling_price, si.profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE 1=1
  `;
  const saleItemsParams = [];
  if (supplier) { saleItemsSql += " AND p.supplier_name = ?"; saleItemsParams.push(supplier); }
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

    const supplierSummary = {};

    // Helper to initialize supplier entry
    const getOrInitSupplier = (sup) => {
      const sName = sup || "No Supplier";
      if (!supplierSummary[sName]) {
        supplierSummary[sName] = {
          supplier: sName,
          purchasedQty: 0,
          soldQty: 0,
          availableStock: 0,
          purchaseCost: 0, // COGS of sold items
          salesAmount: 0,  // Revenue
          profit: 0,       // Sales Amount - Purchase Cost
          loss: 0
        };
      }
      return supplierSummary[sName];
    };

    // Group products by supplier and sum availableStock
    products.forEach((p) => {
      const entry = getOrInitSupplier(p.supplier_name);
      entry.availableStock += Number(p.stock);
    });

    // Process sales items (Sold Qty, Sales Amount, Purchase Cost COGS)
    saleItems.forEach((item) => {
      const entry = getOrInitSupplier(item.supplier_name);
      const qty = Number(item.quantity);
      const selling = Number(item.selling_price) * qty;
      const cost = Number(item.purchase_price) * qty;

      entry.soldQty += qty;
      entry.salesAmount += selling;
      entry.purchaseCost += cost;
    });

    // Calculate Purchased Qty based on date filters or lifetime
    if (startDate && endDate) {
      additionLogs.forEach((log) => {
        // Match pattern: Added 10 Adidas Shoes (Supplier: ABC Traders)
        const match = log.message.match(/Added (\d+).+?\(Supplier: (.+?)\)/);
        if (match) {
          const qty = parseInt(match[1]);
          const supplierName = match[2];

          if (supplier && supplier !== supplierName) return;

          const entry = getOrInitSupplier(supplierName);
          entry.purchasedQty += qty;
        } else {
          // Fallback if no supplier logged
          const legacyMatch = log.message.match(/Added (\d+)/);
          if (legacyMatch) {
            const qty = parseInt(legacyMatch[1]);
            const entry = getOrInitSupplier("No Supplier");
            entry.purchasedQty += qty;
          }
        }
      });
    } else {
      // Lifetime: Purchased Qty = Available Stock + Sold Qty
      Object.keys(supplierSummary).forEach((sup) => {
        supplierSummary[sup].purchasedQty = supplierSummary[sup].availableStock + supplierSummary[sup].soldQty;
      });
    }

    // Process final Profit and Loss calculations supplier-wise
    Object.keys(supplierSummary).forEach((sup) => {
      const sum = supplierSummary[sup];
      const sales = sum.salesAmount;
      const cost = sum.purchaseCost;

      sum.profit = Math.max(sales - cost, 0);
      sum.loss = Math.max(cost - sales, 0);
    });

    const finalReportRows = Object.values(supplierSummary);

    // Sum overall aggregates from supplier-wise row totals
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

// Helper function to query and process report data based on active tab and filters
const retrieveReportData = async (tab, startDate, endDate, search, shopName) => {
  if (tab === "sales") {
    let dateCondition = "";
    const params = [];

    if (startDate && endDate) {
      dateCondition = "WHERE s.date BETWEEN ? AND ?";
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    let whereClause = dateCondition;

    if (search && search.trim() !== "") {
      const searchVal = `%${search.trim()}%`;
      if (whereClause === "") {
        whereClause = "WHERE (s.bill_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE article_number LIKE ?))";
      } else {
        whereClause += " AND (s.bill_no LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE article_number LIKE ?))";
      }
      params.push(searchVal, searchVal, searchVal, searchVal);
    }

    const listSql = `
      SELECT 
        s.id AS sale_id,
        s.bill_no,
        s.date,
        s.discount AS bill_discount,
        s.gst AS bill_gst,
        s.total_price AS bill_total,
        s.total_profit AS bill_profit,
        s.payment_method,
        s.customer_name,
        s.customer_phone,
        si.brand,
        si.type,
        si.size,
        si.color,
        si.quantity,
        si.purchase_price,
        si.selling_price,
        si.article_number,
        p.barcode,
        p.supplier_name
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      LEFT JOIN products p ON si.product_id = p.id
      ${whereClause}
      ORDER BY s.date DESC, si.id ASC
    `;

    const records = await query(listSql, params);

    if (records.length === 0) {
      return {
        tab: "sales",
        shopName,
        summary: {
          totalBills: 0,
          totalItemsSold: 0,
          totalSales: 0,
          totalDiscount: 0,
          totalGst: 0,
          totalPurchaseCost: 0,
          totalProfit: 0,
          cashCollection: 0,
          upiCollection: 0,
          cardCollection: 0,
          otherCollection: 0
        },
        records: []
      };
    }

    const saleSubtotals = {};
    records.forEach(row => {
      if (row.sale_id) {
        if (!saleSubtotals[row.sale_id]) {
          saleSubtotals[row.sale_id] = 0;
        }
        saleSubtotals[row.sale_id] += Number(row.selling_price || 0) * Number(row.quantity || 0);
      }
    });

    const detailedRows = [];
    const uniqueSales = {};

    records.forEach(row => {
      if (!row.sale_id) return;
      const subtotal = saleSubtotals[row.sale_id] || 0;
      const qty = Number(row.quantity || 0);
      const row_subtotal = Number(row.selling_price || 0) * qty;

      const discount = subtotal > 0 ? (row_subtotal / subtotal) * Number(row.bill_discount || 0) : 0;
      const taxable = row_subtotal - discount;
      const gst = (subtotal - Number(row.bill_discount || 0)) > 0
        ? (taxable / (subtotal - Number(row.bill_discount || 0))) * Number(row.bill_gst || 0)
        : 0;

      const grand_total = taxable + gst;
      const purchase_cost = Number(row.purchase_price || 0) * qty;
      const profit = taxable - purchase_cost;

      detailedRows.push({
        bill_no: row.bill_no,
        date: row.date,
        customer_name: row.customer_name || "Walk-in Customer",
        customer_phone: row.customer_phone || "-",
        product_name: `${row.brand || ""} ${row.type || ""}`.trim() || "-",
        brand: row.brand || "-",
        article_number: row.article_number || "-",
        barcode: row.barcode || "-",
        size: row.size || "-",
        color: row.color || "-",
        supplier_name: row.supplier_name || "No Supplier",
        quantity: qty,
        purchase_price: Number(row.purchase_price || 0),
        selling_price: Number(row.selling_price || 0),
        discount: discount,
        gst: gst,
        subtotal: row_subtotal,
        grand_total: grand_total,
        payment_method: row.payment_method || "Cash",
        cashier: "Admin"
      });

      if (!uniqueSales[row.sale_id]) {
        uniqueSales[row.sale_id] = {
          total_price: Number(row.bill_total || 0),
          discount: Number(row.bill_discount || 0),
          gst: Number(row.bill_gst || 0),
          total_profit: Number(row.bill_profit || 0),
          payment_method: row.payment_method || "Cash"
        };
      }
    });

    const salesList = Object.values(uniqueSales);
    const totalBills = salesList.length;
    const totalSales = salesList.reduce((sum, s) => sum + s.total_price, 0);
    const totalDiscount = salesList.reduce((sum, s) => sum + s.discount, 0);
    const totalGst = salesList.reduce((sum, s) => sum + s.gst, 0);
    const totalProfit = salesList.reduce((sum, s) => sum + s.total_profit, 0);

    const totalItemsSold = detailedRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalPurchaseCost = detailedRows.reduce((sum, r) => sum + (r.purchase_price * r.quantity), 0);

    let cashCollection = 0;
    let upiCollection = 0;
    let cardCollection = 0;
    let otherCollection = 0;

    salesList.forEach(s => {
      const method = (s.payment_method || "").toUpperCase();
      if (method === "CASH") {
        cashCollection += s.total_price;
      } else if (method === "UPI") {
        upiCollection += s.total_price;
      } else if (method === "CARD") {
        cardCollection += s.total_price;
      } else {
        otherCollection += s.total_price;
      }
    });

    return {
      tab: "sales",
      shopName,
      summary: {
        totalBills,
        totalItemsSold,
        totalSales,
        totalDiscount,
        totalGst,
        totalPurchaseCost,
        totalProfit,
        cashCollection,
        upiCollection,
        cardCollection,
        otherCollection
      },
      records: detailedRows
    };
  }

  if (tab === "reports") {
    let productSql = "SELECT supplier_name, stock, purchase_price, selling_price FROM products WHERE 1=1";
    const productParams = [];
    if (search && search.trim() !== "") {
      productSql += " AND supplier_name = ?";
      productParams.push(search.trim());
    }

    let saleItemsSql = `
      SELECT p.supplier_name, si.quantity, si.purchase_price, si.selling_price, si.profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE 1=1
    `;
    const saleItemsParams = [];
    if (search && search.trim() !== "") {
      saleItemsSql += " AND p.supplier_name = ?";
      saleItemsParams.push(search.trim());
    }
    if (startDate && endDate) {
      saleItemsSql += " AND s.date BETWEEN ? AND ?";
      saleItemsParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    let activitySql = "SELECT message, created_at FROM activity_log WHERE type = 'addition'";
    const activityParams = [];
    if (startDate && endDate) {
      activitySql += " AND created_at BETWEEN ? AND ?";
      activityParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    const [products, saleItems, additionLogs] = await Promise.all([
      query(productSql, productParams),
      query(saleItemsSql, saleItemsParams),
      (startDate && endDate) ? query(activitySql, activityParams) : Promise.resolve([])
    ]);

    const supplierSummary = {};

    const getOrInitSupplier = (sup) => {
      const sName = sup || "No Supplier";
      if (!supplierSummary[sName]) {
        supplierSummary[sName] = {
          supplier: sName,
          purchasedQty: 0,
          soldQty: 0,
          availableStock: 0,
          purchaseCost: 0,
          salesAmount: 0,
          profit: 0,
          loss: 0
        };
      }
      return supplierSummary[sName];
    };

    products.forEach((p) => {
      const entry = getOrInitSupplier(p.supplier_name);
      entry.availableStock += Number(p.stock || 0);
    });

    saleItems.forEach((item) => {
      const entry = getOrInitSupplier(item.supplier_name);
      const qty = Number(item.quantity || 0);
      const selling = Number(item.selling_price || 0) * qty;
      const cost = Number(item.purchase_price || 0) * qty;

      entry.soldQty += qty;
      entry.salesAmount += selling;
      entry.purchaseCost += cost;
    });

    if (startDate && endDate) {
      additionLogs.forEach((log) => {
        const match = log.message.match(/Added (\d+).+?\(Supplier: (.+?)\)/);
        if (match) {
          const qty = parseInt(match[1]);
          const supplierName = match[2];
          if (search && search.trim() !== supplierName) return;
          const entry = getOrInitSupplier(supplierName);
          entry.purchasedQty += qty;
        } else {
          const legacyMatch = log.message.match(/Added (\d+)/);
          if (legacyMatch) {
            const qty = parseInt(legacyMatch[1]);
            const entry = getOrInitSupplier("No Supplier");
            entry.purchasedQty += qty;
          }
        }
      });
    } else {
      Object.keys(supplierSummary).forEach((sup) => {
        supplierSummary[sup].purchasedQty = supplierSummary[sup].availableStock + supplierSummary[sup].soldQty;
      });
    }

    Object.keys(supplierSummary).forEach((sup) => {
      const sum = supplierSummary[sup];
      const sales = sum.salesAmount;
      const cost = sum.purchaseCost;

      sum.profit = Math.max(sales - cost, 0);
      sum.loss = Math.max(cost - sales, 0);
    });

    const finalReportRows = Object.values(supplierSummary);

    const totalSales = finalReportRows.reduce((sum, r) => sum + r.salesAmount, 0);
    const totalPurchase = finalReportRows.reduce((sum, r) => sum + r.purchaseCost, 0);
    const totalProfit = Math.max(totalSales - totalPurchase, 0);
    const totalLoss = Math.max(totalPurchase - totalSales, 0);

    return {
      tab: "reports",
      shopName,
      summary: {
        totalPurchaseCost: totalPurchase,
        totalSalesAmount: totalSales,
        totalProfit: totalProfit,
        totalLoss: totalLoss
      },
      records: finalReportRows
    };
  }

  if (tab === "activity") {
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

    const results = await query(`SELECT * FROM activity_log ${whereClause} ORDER BY created_at DESC`, params);

    const processedLogs = results.map(row => {
      let reference = "-";
      const refMatch = row.message.match(/\b([A-Z0-9]+-[A-Z0-9]+)\b/i);
      if (refMatch) {
        reference = refMatch[1];
      } else {
        const parenMatch = row.message.match(/\(([^)]+)\)/);
        if (parenMatch && !parenMatch[1].startsWith("Supplier:")) {
          reference = parenMatch[1];
        }
      }

      let action = (row.type || "system").toUpperCase();
      let module = "System";
      if (row.type === "sale") {
        action = "Sale / Billing";
        module = "Sales / POS";
      } else if (row.type === "addition") {
        action = "Stock Addition";
        module = "Inventory";
      } else if (row.type === "edit") {
        action = "Product Edit";
        module = "Inventory";
      }

      return {
        id: row.id,
        created_at: row.created_at,
        user: "Admin",
        action: action,
        module: module,
        description: row.message,
        reference: reference
      };
    });

    return {
      tab: "activity",
      shopName,
      records: processedLogs
    };
  }

  throw new Error("Invalid tab type");
};

// GET /api/reports/export-data
exports.getExportData = async (req, res) => {
  const { tab, startDate, endDate, search } = req.query;
  try {
    const shopNameRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'shop_name'");
    const shopName = shopNameRes[0]?.setting_value || "My Slipper Shop";

    const data = await retrieveReportData(tab, startDate, endDate, search, shopName);
    res.json(data);
  } catch (err) {
    console.error("getExportData error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/reports/export-excel
exports.getExportExcel = async (req, res) => {
  const { tab, startDate, endDate, search } = req.query;
  const ExcelJS = require("exceljs");

  try {
    const shopNameRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'shop_name'");
    const shopName = shopNameRes[0]?.setting_value || "My Slipper Shop";

    const data = await retrieveReportData(tab, startDate, endDate, search, shopName);

    if (!data.records || data.records.length === 0) {
      return res.status(400).json({ error: "No records available for the selected filters." });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Report");

    // Title info block
    worksheet.getCell("A1").value = shopName;
    worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true };

    let reportTitle = "";
    if (tab === "sales") reportTitle = "Sales Invoice History Report";
    if (tab === "reports") reportTitle = "Supplier Business Performance Report";
    if (tab === "activity") reportTitle = "System Activity Logs Report";

    worksheet.getCell("A2").value = reportTitle;
    worksheet.getCell("A2").font = { name: "Arial", size: 12, bold: true };

    const dateRangeStr = `Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`;
    worksheet.getCell("A3").value = dateRangeStr;
    worksheet.getCell("A3").font = { name: "Arial", size: 10, italic: true };

    const generatedStr = `Generated Date/Time: ${new Date().toLocaleString()}`;
    worksheet.getCell("A4").value = generatedStr;
    worksheet.getCell("A4").font = { name: "Arial", size: 10, italic: true };

    const appliedFiltersStr = `Applied Filters: ${search && search.trim() !== "" ? `Search: "${search}"` : "None"}`;
    worksheet.getCell("A5").value = appliedFiltersStr;
    worksheet.getCell("A5").font = { name: "Arial", size: 10, italic: true };

    let headerRowIndex = 7;

    if (tab === "sales") {
      worksheet.getCell("A7").value = "SUMMARY STATISTICS";
      worksheet.getCell("A7").font = { name: "Arial", size: 11, bold: true };
      
      const stats = [
        ["Total Bills", data.summary.totalBills],
        ["Total Items Sold", data.summary.totalItemsSold],
        ["Total Sales", data.summary.totalSales],
        ["Total Discount", data.summary.totalDiscount],
        ["Total GST", data.summary.totalGst],
        ["Total Purchase Cost", data.summary.totalPurchaseCost],
        ["Total Profit", data.summary.totalProfit]
      ];

      stats.forEach((stat, idx) => {
        const rowNum = 8 + idx;
        const cellLabel = worksheet.getCell(`A${rowNum}`);
        const cellVal = worksheet.getCell(`B${rowNum}`);
        
        cellLabel.value = stat[0];
        cellLabel.font = { name: "Arial", bold: true };
        cellLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cellLabel.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

        cellVal.value = stat[1];
        cellVal.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        if (typeof stat[1] === "number" && idx >= 2) {
          cellVal.numFmt = '"₹"#,##0.00';
          cellVal.font = { name: "Arial", bold: true };
        }
      });

      worksheet.getCell("D7").value = "PAYMENT COLLECTION";
      worksheet.getCell("D7").font = { name: "Arial", size: 11, bold: true };

      const payments = [
        ["Cash Collection", data.summary.cashCollection],
        ["UPI Collection", data.summary.upiCollection],
        ["Card Collection", data.summary.cardCollection],
        ["Other Payment Collection", data.summary.otherCollection]
      ];

      payments.forEach((payment, idx) => {
        const rowNum = 8 + idx;
        const cellLabel = worksheet.getCell(`D${rowNum}`);
        const cellVal = worksheet.getCell(`E${rowNum}`);

        cellLabel.value = payment[0];
        cellLabel.font = { name: "Arial", bold: true };
        cellLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        cellLabel.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

        cellVal.value = payment[1];
        cellVal.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cellVal.numFmt = '"₹"#,##0.00';
        cellVal.font = { name: "Arial", bold: true };
      });

      headerRowIndex = 17;
    }

    // Set columns configuration
    let columns = [];
    if (tab === "sales") {
      columns = [
        { header: "Invoice Number", key: "bill_no" },
        { header: "Date", key: "date" },
        { header: "Time", key: "time" },
        { header: "Customer Name", key: "customer_name" },
        { header: "Customer Mobile", key: "customer_phone" },
        { header: "Product / Item Name", key: "product_name" },
        { header: "Brand", key: "brand" },
        { header: "Article Number", key: "article_number" },
        { header: "Barcode", key: "barcode" },
        { header: "Size", key: "size" },
        { header: "Color", key: "color" },
        { header: "Supplier", key: "supplier_name" },
        { header: "Quantity", key: "quantity" },
        { header: "Purchase Price", key: "purchase_price" },
        { header: "Selling Price", key: "selling_price" },
        { header: "Discount", key: "discount" },
        { header: "GST", key: "gst" },
        { header: "Subtotal", key: "subtotal" },
        { header: "Grand Total", key: "grand_total" },
        { header: "Payment Mode", key: "payment_method" },
        { header: "Cashier / Admin", key: "cashier" }
      ];
    } else if (tab === "reports") {
      columns = [
        { header: "Supplier Name", key: "supplier" },
        { header: "Purchased Quantity", key: "purchasedQty" },
        { header: "Sold Quantity", key: "soldQty" },
        { header: "Available Stock", key: "availableStock" },
        { header: "Purchase Cost", key: "purchaseCost" },
        { header: "Sales Revenue", key: "salesAmount" },
        { header: "Profit / Loss", key: "profit" }
      ];
    } else if (tab === "activity") {
      columns = [
        { header: "Date", key: "date" },
        { header: "Time", key: "time" },
        { header: "User / Admin", key: "user" },
        { header: "Action", key: "action" },
        { header: "Module", key: "module" },
        { header: "Description", key: "description" },
        { header: "Reference / Invoice Number", key: "reference" }
      ];
    }

    // Set headers
    const headerRow = worksheet.getRow(headerRowIndex);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } }; // Slate 800
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "medium" }, right: { style: "thin" } };
    });
    headerRow.height = 24;

    // Freeze header row
    worksheet.views = [{ state: "frozen", ySplit: headerRowIndex }];

    // Populate data
    const startDataRow = headerRowIndex + 1;
    data.records.forEach((rec, recIdx) => {
      const rowNum = startDataRow + recIdx;
      const row = worksheet.getRow(rowNum);

      if (tab === "sales") {
        const dObj = new Date(rec.date);
        row.getCell(1).value = rec.bill_no;
        row.getCell(2).value = dObj.toLocaleDateString("en-IN");
        row.getCell(3).value = dObj.toLocaleTimeString("en-IN");
        row.getCell(4).value = rec.customer_name;
        row.getCell(5).value = rec.customer_phone;
        row.getCell(6).value = rec.product_name;
        row.getCell(7).value = rec.brand;
        row.getCell(8).value = rec.article_number;
        row.getCell(9).value = rec.barcode;
        row.getCell(10).value = rec.size;
        row.getCell(11).value = rec.color;
        row.getCell(12).value = rec.supplier_name;
        row.getCell(13).value = rec.quantity;
        row.getCell(14).value = rec.purchase_price;
        row.getCell(15).value = rec.selling_price;
        row.getCell(16).value = rec.discount;
        row.getCell(17).value = rec.gst;
        row.getCell(18).value = rec.subtotal;
        row.getCell(19).value = rec.grand_total;
        row.getCell(20).value = rec.payment_method;
        row.getCell(21).value = rec.cashier;

        // Formats
        row.getCell(13).numFmt = "#,##0";
        row.getCell(14).numFmt = '"₹"#,##0.00';
        row.getCell(15).numFmt = '"₹"#,##0.00';
        row.getCell(16).numFmt = '"₹"#,##0.00';
        row.getCell(17).numFmt = '"₹"#,##0.00';
        row.getCell(18).numFmt = '"₹"#,##0.00';
        row.getCell(19).numFmt = '"₹"#,##0.00';

        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).alignment = { horizontal: "center" };
        row.getCell(10).alignment = { horizontal: "center" };
        row.getCell(11).alignment = { horizontal: "center" };
        row.getCell(13).alignment = { horizontal: "center" };
        row.getCell(20).alignment = { horizontal: "center" };
        row.getCell(21).alignment = { horizontal: "center" };
      } else if (tab === "reports") {
        row.getCell(1).value = rec.supplier;
        row.getCell(2).value = rec.purchasedQty;
        row.getCell(3).value = rec.soldQty;
        row.getCell(4).value = rec.availableStock;
        row.getCell(5).value = rec.purchaseCost;
        row.getCell(6).value = rec.salesAmount;
        row.getCell(7).value = rec.profit;

        row.getCell(2).numFmt = "#,##0";
        row.getCell(3).numFmt = "#,##0";
        row.getCell(4).numFmt = "#,##0";
        row.getCell(5).numFmt = '"₹"#,##0.00';
        row.getCell(6).numFmt = '"₹"#,##0.00';
        row.getCell(7).numFmt = '"₹"#,##0.00';

        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).alignment = { horizontal: "center" };
        row.getCell(4).alignment = { horizontal: "center" };
      } else if (tab === "activity") {
        const dObj = new Date(rec.created_at);
        row.getCell(1).value = dObj.toLocaleDateString("en-IN");
        row.getCell(2).value = dObj.toLocaleTimeString("en-IN");
        row.getCell(3).value = rec.user;
        row.getCell(4).value = rec.action;
        row.getCell(5).value = rec.module;
        row.getCell(6).value = rec.description;
        row.getCell(7).value = rec.reference;

        row.getCell(1).alignment = { horizontal: "center" };
        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).alignment = { horizontal: "center" };
        row.getCell(4).alignment = { horizontal: "center" };
        row.getCell(5).alignment = { horizontal: "center" };
        row.getCell(7).alignment = { horizontal: "center" };
      }

      // Add borders and handle null/NaN
      columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        if (cell.value === undefined || cell.value === null || Number.isNaN(cell.value)) {
          cell.value = "-";
        }
        cell.font = { name: "Arial", size: 10 };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      row.height = 20;
    });

    // Total row at bottom
    const endDataRow = startDataRow + data.records.length - 1;
    const totalRowIndex = endDataRow + 1;

    if (tab === "sales" || tab === "reports") {
      const totalRow = worksheet.getRow(totalRowIndex);
      totalRow.getCell(1).value = "Total";
      totalRow.getCell(1).font = { name: "Arial", size: 10, bold: true };
      
      columns.forEach((col, idx) => {
        const cell = totalRow.getCell(idx + 1);
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "double" }, right: { style: "thin" } };
        cell.font = { name: "Arial", size: 10, bold: true };
      });

      if (tab === "sales") {
        totalRow.getCell(13).value = { formula: `SUM(M${startDataRow}:M${endDataRow})` };
        totalRow.getCell(13).numFmt = "#,##0";
        totalRow.getCell(13).alignment = { horizontal: "center" };

        totalRow.getCell(16).value = { formula: `SUM(P${startDataRow}:P${endDataRow})` };
        totalRow.getCell(16).numFmt = '"₹"#,##0.00';

        totalRow.getCell(17).value = { formula: `SUM(Q${startDataRow}:Q${endDataRow})` };
        totalRow.getCell(17).numFmt = '"₹"#,##0.00';

        totalRow.getCell(18).value = { formula: `SUM(R${startDataRow}:R${endDataRow})` };
        totalRow.getCell(18).numFmt = '"₹"#,##0.00';

        totalRow.getCell(19).value = { formula: `SUM(S${startDataRow}:S${endDataRow})` };
        totalRow.getCell(19).numFmt = '"₹"#,##0.00';
      } else if (tab === "reports") {
        totalRow.getCell(2).value = { formula: `SUM(B${startDataRow}:B${endDataRow})` };
        totalRow.getCell(2).numFmt = "#,##0";
        totalRow.getCell(2).alignment = { horizontal: "center" };

        totalRow.getCell(3).value = { formula: `SUM(C${startDataRow}:C${endDataRow})` };
        totalRow.getCell(3).numFmt = "#,##0";
        totalRow.getCell(3).alignment = { horizontal: "center" };

        totalRow.getCell(4).value = { formula: `SUM(D${startDataRow}:D${endDataRow})` };
        totalRow.getCell(4).numFmt = "#,##0";
        totalRow.getCell(4).alignment = { horizontal: "center" };

        totalRow.getCell(5).value = { formula: `SUM(E${startDataRow}:E${endDataRow})` };
        totalRow.getCell(5).numFmt = '"₹"#,##0.00';

        totalRow.getCell(6).value = { formula: `SUM(F${startDataRow}:F${endDataRow})` };
        totalRow.getCell(6).numFmt = '"₹"#,##0.00';

        totalRow.getCell(7).value = { formula: `SUM(G${startDataRow}:G${endDataRow})` };
        totalRow.getCell(7).numFmt = '"₹"#,##0.00';
      }
      totalRow.height = 22;
    }

    // Auto-fit Column Widths
    worksheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        if (cell.row < headerRowIndex) return;
        let val = "";
        if (cell.value && typeof cell.value === "object" && cell.value.formula) {
          val = "₹99,999.00";
        } else if (cell.value !== null && cell.value !== undefined) {
          val = String(cell.value);
        }
        if (val.length > maxLen) {
          maxLen = val.length;
        }
      });
      column.width = Math.max(maxLen + 4, 12);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=SlipperShop_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Export Excel generation error:", err);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      res.status(500).json({ error: err.message });
    }
  }
};

// GET /api/customers
exports.getCustomerHistoryList = async (req, res) => {
  const { search, startDate, endDate } = req.query;
  try {
    let dateCondition = "";
    let dateSubCondition = "";
    const params = [];
    const subParams = [];

    if (startDate && endDate) {
      dateCondition = " AND date BETWEEN ? AND ? ";
      dateSubCondition = " AND s2.date BETWEEN ? AND ? ";
      params.push(startDate + " 00:00:00", endDate + " 23:59:59");
      subParams.push(startDate + " 00:00:00", endDate + " 23:59:59");
    }

    let searchCondition = "";
    if (search && search.trim() !== "") {
      const searchWild = `%${search.trim()}%`;
      searchCondition = " HAVING customer_name LIKE ? OR customer_phone LIKE ? ";
      params.push(searchWild, searchWild);
    }

    const sql = `
      SELECT 
        c.customer_name,
        c.customer_phone,
        c.total_bills,
        c.last_purchase_date,
        c.total_amount_spent,
        COALESCE((
          SELECT SUM(si.quantity) 
          FROM sale_items si 
          JOIN sales s2 ON si.sale_id = s2.id 
          WHERE (
            (c.customer_phone IS NOT NULL AND c.customer_phone != '' AND s2.customer_phone = c.customer_phone)
            OR
            ((c.customer_phone IS NULL OR c.customer_phone = '') AND s2.customer_name = c.customer_name)
          )
          ${dateSubCondition}
        ), 0) AS total_items_purchased
      FROM (
        SELECT 
          MAX(customer_name) AS customer_name,
          MAX(NULLIF(TRIM(customer_phone), '')) AS customer_phone,
          COUNT(id) AS total_bills,
          MAX(date) AS last_purchase_date,
          SUM(total_price) AS total_amount_spent
        FROM sales
        WHERE customer_name IS NOT NULL AND customer_name != ''
        ${dateCondition}
        GROUP BY COALESCE(NULLIF(TRIM(customer_phone), ''), customer_name)
      ) c
      ${searchCondition}
      ORDER BY last_purchase_date DESC
    `;

    const queryParams = [...subParams, ...params];
    const records = await query(sql, queryParams);
    res.json(records);
  } catch (err) {
    console.error("getCustomerHistoryList error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/customers/:phone/history
exports.getCustomerPurchaseHistory = async (req, res) => {
  const { phone } = req.params;
  const { search, startDate, endDate } = req.query;
  const decodedId = decodeURIComponent(phone).trim();
  try {
    let sql = `
      SELECT 
        s.id AS sale_id,
        s.bill_no,
        s.date,
        s.payment_method,
        s.discount AS bill_discount,
        s.gst AS bill_gst,
        s.total_price AS bill_total,
        si.id AS item_id,
        si.brand,
        si.type,
        si.size,
        si.color,
        si.quantity,
        si.selling_price,
        si.article_number
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE (s.customer_phone = ? OR (s.customer_phone IS NULL AND s.customer_name = ?) OR s.customer_name = ?)
    `;
    const params = [decodedId, decodedId, decodedId];

    if (startDate && endDate) {
      sql += " AND s.date BETWEEN ? AND ? ";
      params.push(startDate + " 00:00:00", endDate + " 23:59:59");
    }

    if (search && search.trim() !== "") {
      const searchWild = `%${search.trim()}%`;
      sql += " AND (s.bill_no LIKE ? OR si.brand LIKE ? OR si.type LIKE ? OR si.article_number LIKE ?) ";
      params.push(searchWild, searchWild, searchWild, searchWild);
    }

    sql += " ORDER BY s.date DESC ";

    const rows = await query(sql, params);

    const salesSubtotals = {};
    rows.forEach(r => {
      if (!salesSubtotals[r.sale_id]) {
        salesSubtotals[r.sale_id] = 0;
      }
      salesSubtotals[r.sale_id] += r.selling_price * r.quantity;
    });

    const records = rows.map(r => {
      const itemSubtotal = r.selling_price * r.quantity;
      const billSubtotal = salesSubtotals[r.sale_id] || 1;
      const share = itemSubtotal / billSubtotal;
      const itemDiscount = share * r.bill_discount;
      const itemTaxable = itemSubtotal - itemDiscount;
      const billTaxable = billSubtotal - r.bill_discount;
      const itemGst = billTaxable > 0 ? (itemTaxable / billTaxable) * r.bill_gst : 0;
      const itemTotal = itemTaxable + itemGst;

      return {
        bill_no: r.bill_no,
        date: r.date,
        product_name: r.product_name || `${r.brand} ${r.type}`,
        brand: r.brand,
        type: r.type,
        size: r.size,
        color: r.color,
        quantity: r.quantity,
        selling_price: r.selling_price,
        discount: itemDiscount,
        gst: itemGst,
        total_amount: itemTotal,
        payment_method: r.payment_method,
        article_number: r.article_number
      };
    });

    res.json(records);
  } catch (err) {
    console.error("getCustomerPurchaseHistory error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/purchases
exports.getPurchaseHistory = async (req, res) => {
  const { supplier, brand, type, article_number, startDate, endDate } = req.query;
  try {
    let sql = "SELECT * FROM purchase_history WHERE 1=1";
    const params = [];

    if (supplier && supplier.trim() !== "") {
      sql += " AND supplier_name = ? ";
      params.push(supplier);
    }
    if (brand && brand.trim() !== "") {
      sql += " AND brand = ? ";
      params.push(brand);
    }
    if (type && type.trim() !== "") {
      sql += " AND type = ? ";
      params.push(type);
    }
    if (article_number && article_number.trim() !== "") {
      sql += " AND article_number = ? ";
      params.push(article_number);
    }
    if (startDate && endDate) {
      sql += " AND purchase_date BETWEEN ? AND ? ";
      params.push(startDate + " 00:00:00", endDate + " 23:59:59");
    }

    sql += " ORDER BY purchase_date DESC ";

    const records = await query(sql, params);

    let totalQty = 0;
    let totalValue = 0;
    records.forEach(r => {
      totalQty += r.quantity;
      totalValue += Number(r.total_value);
    });

    res.json({
      summary: {
        totalQty,
        totalValue
      },
      records
    });
  } catch (err) {
    console.error("getPurchaseHistory error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// CUSTOMER HISTORY EXPORTS (reuse Sales History pattern)
// ============================================================

// Helper: fetch all customer purchase rows matching filters
const fetchCustomerExportRows = async (search, startDate, endDate) => {
  let sql = `
    SELECT
      s.bill_no,
      s.date,
      s.payment_method,
      s.discount    AS bill_discount,
      s.gst         AS bill_gst,
      s.total_price AS bill_total,
      s.customer_name,
      s.customer_phone,
      si.brand,
      si.type,
      si.size,
      si.color,
      si.quantity,
      si.selling_price,
      si.article_number,
      si.sale_id
    FROM sales s
    JOIN sale_items si ON s.id = si.sale_id
    WHERE s.customer_name IS NOT NULL AND s.customer_name != ''
      AND s.customer_name != 'Walk-in Customer'
  `;
  const params = [];

  if (search && search.trim() !== "") {
    const w = `%${search.trim()}%`;
    sql += " AND (s.customer_name LIKE ? OR s.customer_phone LIKE ?) ";
    params.push(w, w);
  }
  if (startDate && endDate) {
    sql += " AND s.date BETWEEN ? AND ? ";
    params.push(startDate + " 00:00:00", endDate + " 23:59:59");
  }

  sql += " ORDER BY s.date DESC, s.id, si.id ";

  const rows = await query(sql, params);

  // Compute per-sale subtotals in JS for proportional discount/gst allocation
  const saleSubtotals = {};
  rows.forEach(r => {
    if (!saleSubtotals[r.bill_no]) saleSubtotals[r.bill_no] = 0;
    saleSubtotals[r.bill_no] += Number(r.selling_price) * r.quantity;
  });

  return rows.map(r => {
    const itemSubtotal = Number(r.selling_price) * r.quantity;
    const billSub = saleSubtotals[r.bill_no] || 1;
    const share = itemSubtotal / billSub;
    const itemDiscount = share * Number(r.bill_discount);
    const itemTaxable = itemSubtotal - itemDiscount;
    const billTaxable = billSub - Number(r.bill_discount);
    const itemGst = billTaxable > 0 ? (itemTaxable / billTaxable) * Number(r.bill_gst) : 0;
    const grandTotal = itemTaxable + itemGst;
    const dObj = new Date(r.date);

    return {
      bill_no: r.bill_no,
      date: r.date,
      date_str: dObj.toLocaleDateString("en-IN"),
      time_str: dObj.toLocaleTimeString("en-IN"),
      customer_name: r.customer_name,
      customer_phone: r.customer_phone || "N/A",
      product_name: `${r.brand} ${r.type}`,
      brand: r.brand,
      article_number: r.article_number || "",
      size: r.size,
      color: r.color,
      quantity: r.quantity,
      selling_price: Number(r.selling_price),
      discount: itemDiscount,
      gst: itemGst,
      subtotal: itemSubtotal,
      grand_total: grandTotal,
      payment_method: r.payment_method
    };
  });
};


// GET /api/customers/export-data  (used by PDF export)
exports.getCustomerExportData = async (req, res) => {
  const { search, startDate, endDate } = req.query;
  try {
    const shopNameRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'shop_name'");
    const shopName = shopNameRes[0]?.setting_value || "My Slipper Shop";

    const records = await fetchCustomerExportRows(search, startDate, endDate);

    const summary = {
      totalBills: new Set(records.map(r => r.bill_no)).size,
      totalItemsSold: records.reduce((s, r) => s + r.quantity, 0),
      totalSales: records.reduce((s, r) => s + r.subtotal, 0),
      totalDiscount: records.reduce((s, r) => s + r.discount, 0),
      totalGst: records.reduce((s, r) => s + r.gst, 0),
      totalGrandTotal: records.reduce((s, r) => s + r.grand_total, 0)
    };

    res.json({ shopName, records, summary });
  } catch (err) {
    console.error("getCustomerExportData error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/customers/export-excel  (ExcelJS, same pattern as Sales History)
exports.getCustomerExportExcel = async (req, res) => {
  const { search, startDate, endDate } = req.query;
  const ExcelJS = require("exceljs");

  try {
    const shopNameRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'shop_name'");
    const shopName = shopNameRes[0]?.setting_value || "My Slipper Shop";

    const records = await fetchCustomerExportRows(search, startDate, endDate);

    if (!records || records.length === 0) {
      return res.status(400).json({ error: "No customer records available for the selected filters." });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer History");

    // Title block — same style as Sales History
    worksheet.getCell("A1").value = shopName;
    worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true };

    worksheet.getCell("A2").value = "Customer Purchase History Report";
    worksheet.getCell("A2").font = { name: "Arial", size: 12, bold: true };

    worksheet.getCell("A3").value = `Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`;
    worksheet.getCell("A3").font = { name: "Arial", size: 10, italic: true };

    worksheet.getCell("A4").value = `Generated Date/Time: ${new Date().toLocaleString()}`;
    worksheet.getCell("A4").font = { name: "Arial", size: 10, italic: true };

    worksheet.getCell("A5").value = `Applied Filters: ${search && search.trim() !== "" ? `Search: "${search}"` : "None"}`;
    worksheet.getCell("A5").font = { name: "Arial", size: 10, italic: true };

    const headerRowIndex = 7;

    // Columns — same structure as Sales History "sales" tab
    const columns = [
      { header: "Invoice Number",   key: "bill_no" },
      { header: "Date",             key: "date_str" },
      { header: "Time",             key: "time_str" },
      { header: "Customer Name",    key: "customer_name" },
      { header: "Customer Mobile",  key: "customer_phone" },
      { header: "Product / Item",   key: "product_name" },
      { header: "Brand",            key: "brand" },
      { header: "Article Number",   key: "article_number" },
      { header: "Size",             key: "size" },
      { header: "Color",            key: "color" },
      { header: "Quantity",         key: "quantity" },
      { header: "Selling Price",    key: "selling_price" },
      { header: "Discount",         key: "discount" },
      { header: "GST",              key: "gst" },
      { header: "Subtotal",         key: "subtotal" },
      { header: "Grand Total",      key: "grand_total" },
      { header: "Payment Mode",     key: "payment_method" }
    ];

    // Header row — same dark slate style as Sales History
    const headerRow = worksheet.getRow(headerRowIndex);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.header;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium" }, left: { style: "thin" }, bottom: { style: "medium" }, right: { style: "thin" } };
    });
    headerRow.height = 24;

    worksheet.views = [{ state: "frozen", ySplit: headerRowIndex }];

    // Data rows
    const startDataRow = headerRowIndex + 1;
    records.forEach((rec, recIdx) => {
      const rowNum = startDataRow + recIdx;
      const row = worksheet.getRow(rowNum);

      row.getCell(1).value  = rec.bill_no;
      row.getCell(2).value  = rec.date_str;
      row.getCell(3).value  = rec.time_str;
      row.getCell(4).value  = rec.customer_name;
      row.getCell(5).value  = rec.customer_phone;
      row.getCell(6).value  = rec.product_name;
      row.getCell(7).value  = rec.brand;
      row.getCell(8).value  = rec.article_number;
      row.getCell(9).value  = rec.size;
      row.getCell(10).value = rec.color;
      row.getCell(11).value = rec.quantity;
      row.getCell(12).value = rec.selling_price;
      row.getCell(13).value = rec.discount;
      row.getCell(14).value = rec.gst;
      row.getCell(15).value = rec.subtotal;
      row.getCell(16).value = rec.grand_total;
      row.getCell(17).value = rec.payment_method;

      // Number formats
      row.getCell(11).numFmt = "#,##0";
      row.getCell(12).numFmt = '"₹"#,##0.00';
      row.getCell(13).numFmt = '"₹"#,##0.00';
      row.getCell(14).numFmt = '"₹"#,##0.00';
      row.getCell(15).numFmt = '"₹"#,##0.00';
      row.getCell(16).numFmt = '"₹"#,##0.00';

      // Alignment
      row.getCell(2).alignment  = { horizontal: "center" };
      row.getCell(3).alignment  = { horizontal: "center" };
      row.getCell(9).alignment  = { horizontal: "center" };
      row.getCell(10).alignment = { horizontal: "center" };
      row.getCell(11).alignment = { horizontal: "center" };
      row.getCell(17).alignment = { horizontal: "center" };

      // Borders + null guard
      columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        if (cell.value === undefined || cell.value === null || Number.isNaN(cell.value)) {
          cell.value = "-";
        }
        cell.font   = { name: "Arial", size: 10 };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      row.height = 20;
    });

    // Total row
    const endDataRow   = startDataRow + records.length - 1;
    const totalRowIdx  = endDataRow + 1;
    const totalRow     = worksheet.getRow(totalRowIdx);
    totalRow.getCell(1).value = "Total";
    totalRow.getCell(1).font  = { name: "Arial", size: 10, bold: true };

    totalRow.getCell(11).value  = { formula: `SUM(K${startDataRow}:K${endDataRow})` };
    totalRow.getCell(11).numFmt = "#,##0";
    totalRow.getCell(11).alignment = { horizontal: "center" };
    totalRow.getCell(13).value  = { formula: `SUM(M${startDataRow}:M${endDataRow})` };
    totalRow.getCell(13).numFmt = '"₹"#,##0.00';
    totalRow.getCell(14).value  = { formula: `SUM(N${startDataRow}:N${endDataRow})` };
    totalRow.getCell(14).numFmt = '"₹"#,##0.00';
    totalRow.getCell(16).value  = { formula: `SUM(P${startDataRow}:P${endDataRow})` };
    totalRow.getCell(16).numFmt = '"₹"#,##0.00';

    columns.forEach((col, idx) => {
      const cell = totalRow.getCell(idx + 1);
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "double" }, right: { style: "thin" } };
      cell.font   = { name: "Arial", size: 10, bold: true };
    });
    totalRow.height = 22;

    // Auto-fit column widths
    worksheet.columns.forEach(column => {
      let maxLen = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        if (cell.row < headerRowIndex) return;
        let val = "";
        if (cell.value && typeof cell.value === "object" && cell.value.formula) {
          val = "₹99,999.00";
        } else if (cell.value !== null && cell.value !== undefined) {
          val = String(cell.value);
        }
        if (val.length > maxLen) maxLen = val.length;
      });
      column.width = Math.max(maxLen + 4, 12);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=CustomerHistory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("getCustomerExportExcel error:", err);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      res.status(500).json({ error: err.message });
    }
  }
};

