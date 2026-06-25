const db = require("../config/db");

// Helper to execute query with promise
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
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
