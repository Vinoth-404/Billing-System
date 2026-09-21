const db = require("../config/db");

// Helper to execute query with promise
const query = async (sql, params = []) => {
  const [results] = await db.query(sql, params);
  return results;
};

// Get all expenses with filtering and search
exports.getExpenses = async (req, res) => {
  try {
    const { category, startDate, endDate, search } = req.query;
    let sql = "SELECT * FROM expenses WHERE 1=1";
    const params = [];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    if (startDate) {
      sql += " AND expense_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      sql += " AND expense_date <= ?";
      params.push(endDate);
    }
    if (search) {
      sql += " AND (expense_name LIKE ? OR description LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY expense_date DESC, id DESC";

    const results = await query(sql, params);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new expense
exports.createExpense = async (req, res) => {
  try {
    const { expense_name, category, amount, expense_date, description } = req.body;

    if (!expense_name || !category || amount === undefined || !expense_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal < 0) {
      return res.status(400).json({ error: "Amount must be a non-negative number" });
    }

    const sql = `
      INSERT INTO expenses (expense_name, category, amount, expense_date, description)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await query(sql, [
      expense_name.trim(),
      category.trim(),
      amountVal,
      expense_date,
      description ? description.trim() : null
    ]);

    res.status(201).json({
      message: "Expense recorded successfully",
      id: result.insertId,
      expense: {
        id: result.insertId,
        expense_name,
        category,
        amount: amountVal,
        expense_date,
        description
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update an existing expense
exports.updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { expense_name, category, amount, expense_date, description } = req.body;

    if (!expense_name || !category || amount === undefined || !expense_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal < 0) {
      return res.status(400).json({ error: "Amount must be a non-negative number" });
    }

    // Check if expense exists
    const checkSql = "SELECT * FROM expenses WHERE id = ?";
    const existing = await query(checkSql, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const sql = `
      UPDATE expenses
      SET expense_name = ?, category = ?, amount = ?, expense_date = ?, description = ?
      WHERE id = ?
    `;
    await query(sql, [
      expense_name.trim(),
      category.trim(),
      amountVal,
      expense_date,
      description ? description.trim() : null,
      id
    ]);

    res.json({
      message: "Expense updated successfully",
      expense: {
        id: parseInt(id),
        expense_name,
        category,
        amount: amountVal,
        expense_date,
        description
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete an expense
exports.deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if expense exists
    const checkSql = "SELECT * FROM expenses WHERE id = ?";
    const existing = await query(checkSql, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const sql = "DELETE FROM expenses WHERE id = ?";
    await query(sql, [id]);

    res.json({ message: "Expense deleted successfully", id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Internal helper for fetching expense export data
const retrieveExpenseReportData = async (category, startDate, endDate, search) => {
  const shopNameRes = await query("SELECT setting_value FROM settings WHERE setting_key = 'shop_name'");
  const shopName = shopNameRes[0]?.setting_value || "My Slipper Shop";

  let sql = "SELECT * FROM expenses WHERE 1=1";
  const params = [];

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (startDate) {
    sql += " AND expense_date >= ?";
    params.push(startDate);
  }
  if (endDate) {
    sql += " AND expense_date <= ?";
    params.push(endDate);
  }
  if (search) {
    sql += " AND (expense_name LIKE ? OR description LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += " ORDER BY expense_date DESC, id DESC";

  const records = await query(sql, params);
  const totalAmount = records.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    shopName,
    records,
    summary: {
      totalRecords: records.length,
      totalAmount
    },
    filters: {
      category: category || "",
      startDate: startDate || "",
      endDate: endDate || "",
      search: search || ""
    }
  };
};

// GET /api/expenses/export-data (used for PDF export & structured report payload)
exports.getExportData = async (req, res) => {
  try {
    const { category, startDate, endDate, search } = req.query;
    const data = await retrieveExpenseReportData(category, startDate, endDate, search);
    res.json(data);
  } catch (err) {
    console.error("Expense getExportData error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/expenses/export-excel
exports.getExportExcel = async (req, res) => {
  const { category, startDate, endDate, search } = req.query;
  const ExcelJS = require("exceljs");

  try {
    const data = await retrieveExpenseReportData(category, startDate, endDate, search);

    if (!data.records || data.records.length === 0) {
      return res.status(400).json({ error: "No records available for the selected filters." });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Expenses");

    // Title info block
    worksheet.getCell("A1").value = data.shopName;
    worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true };

    worksheet.getCell("A2").value = "Expenses Report";
    worksheet.getCell("A2").font = { name: "Arial", size: 12, bold: true };

    const dateRangeStr = `Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`;
    worksheet.getCell("A3").value = dateRangeStr;
    worksheet.getCell("A3").font = { name: "Arial", size: 10, italic: true };

    const generatedStr = `Generated Date/Time: ${new Date().toLocaleString()}`;
    worksheet.getCell("A4").value = generatedStr;
    worksheet.getCell("A4").font = { name: "Arial", size: 10, italic: true };

    const activeFilters = [];
    if (category) activeFilters.push(`Category: "${category}"`);
    if (search && search.trim() !== "") activeFilters.push(`Search: "${search.trim()}"`);
    const appliedFiltersStr = `Applied Filters: ${activeFilters.length > 0 ? activeFilters.join(", ") : "None"}`;
    worksheet.getCell("A5").value = appliedFiltersStr;
    worksheet.getCell("A5").font = { name: "Arial", size: 10, italic: true };

    // Summary block
    worksheet.getCell("A7").value = "SUMMARY STATISTICS";
    worksheet.getCell("A7").font = { name: "Arial", size: 11, bold: true };

    const stats = [
      ["Total Expense Records", data.summary.totalRecords],
      ["Total Expense Amount", data.summary.totalAmount]
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
      if (idx === 1) {
        cellVal.numFmt = '"₹"#,##0.00';
        cellVal.font = { name: "Arial", bold: true };
      } else {
        cellVal.numFmt = "#,##0";
        cellVal.font = { name: "Arial", bold: true };
      }
    });

    const headerRowIndex = 11;
    const columns = [
      { header: "Expense Date", key: "expense_date" },
      { header: "Expense Name", key: "expense_name" },
      { header: "Category", key: "category" },
      { header: "Amount", key: "amount" },
      { header: "Description / Notes", key: "description" }
    ];

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

    const startDataRow = headerRowIndex + 1;
    data.records.forEach((rec, recIdx) => {
      const rowNum = startDataRow + recIdx;
      const row = worksheet.getRow(rowNum);

      const dObj = rec.expense_date ? new Date(rec.expense_date) : null;
      row.getCell(1).value = dObj ? dObj.toLocaleDateString("en-IN") : "-";
      row.getCell(2).value = rec.expense_name || "-";
      row.getCell(3).value = rec.category || "-";
      row.getCell(4).value = Number(rec.amount || 0);
      row.getCell(5).value = rec.description || "-";

      row.getCell(4).numFmt = '"₹"#,##0.00';

      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(3).alignment = { horizontal: "center" };

      columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        cell.font = { name: "Arial", size: 10 };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });
      row.height = 20;
    });

    // Total row
    const endDataRow = startDataRow + data.records.length - 1;
    const totalRowIndex = endDataRow + 1;
    const totalRow = worksheet.getRow(totalRowIndex);

    totalRow.getCell(1).value = "Total";
    totalRow.getCell(1).font = { name: "Arial", size: 10, bold: true };

    columns.forEach((col, idx) => {
      const cell = totalRow.getCell(idx + 1);
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "double" }, right: { style: "thin" } };
      cell.font = { name: "Arial", size: 10, bold: true };
    });

    totalRow.getCell(4).value = { formula: `SUM(D${startDataRow}:D${endDataRow})` };
    totalRow.getCell(4).numFmt = '"₹"#,##0.00';
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
        if (val.length > maxLen) {
          maxLen = val.length;
        }
      });
      column.width = Math.max(maxLen + 4, 14);
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Expenses_${new Date().toISOString().slice(0, 10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Expense getExportExcel error:", err);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
      res.status(500).json({ error: err.message });
    }
  }
};
