import { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const API = import.meta.env.VITE_API_URL;
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle2,
  Search,
  Calendar,
  Filter,
  DollarSign,
  Edit3,
  Trash2,
  Receipt,
  FileSpreadsheet,
  FileText
} from "lucide-react";

function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ type: "", message: "" });

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // "add" or "edit"
  const [selectedExpense, setSelectedExpense] = useState(null);
  
  // Form Inputs
  const [expenseName, setExpenseName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [description, setDescription] = useState("");
  
  const [modalError, setModalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState([]);

  const fetchCategories = () => {
    axios
      .get(`${API}/api/master/expense_categories`)
      .then((res) => {
        setCategories((res.data || []).map(item => item.name));
      })
      .catch((err) => console.error("Error fetching expense categories:", err));
  };

  useEffect(() => {
    fetchCategories();

    const handleCategoriesUpdate = () => {
      fetchCategories();
    };
    window.addEventListener("stock-updated", handleCategoriesUpdate);
    return () => {
      window.removeEventListener("stock-updated", handleCategoriesUpdate);
    };
  }, []);

  const fetchExpenses = () => {
    setLoading(true);
    setAlert({ type: "", message: "" });

    const params = {};
    if (selectedCategory) params.category = selectedCategory;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (searchQuery) params.search = searchQuery;

    axios
      .get(`${API}/api/expenses`, { params })
      .then((res) => {
        setExpenses(res.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading expenses:", err);
        setAlert({
          type: "danger",
          message: "Failed to load expenses list from database."
        });
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchExpenses();
  }, [selectedCategory, startDate, endDate]); // Trigger fetch when filters change

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchExpenses();
  };

  const handleResetFilters = () => {
    const needManualFetch = !selectedCategory && !startDate && !endDate && searchQuery;
    setSearchQuery("");
    setSelectedCategory("");
    setStartDate("");
    setEndDate("");
    if (needManualFetch) {
      setTimeout(() => {
        fetchExpenses();
      }, 0);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("category", selectedCategory);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";

      const response = await axios.get(`${API}/api/expenses/export-excel${qs}`, {
        responseType: "blob"
      });

      if (response.headers["content-type"]?.includes("application/json")) {
        const text = await response.data.text();
        const errObj = JSON.parse(text);
        alert(errObj.error || "Export failed.");
        return;
      }

      const blob = new Blob([response.data], { type: response.headers["content-type"] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      let filename = `Expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const disposition = response.headers["content-disposition"];
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const fnMatch = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (fnMatch?.[1]) filename = fnMatch[1].replace(/['"]/g, "");
      }
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Excel error:", err);
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const errObj = JSON.parse(text);
          alert(errObj.error || "No records available for the selected filters.");
        } catch {
          alert("Failed to export Excel report.");
        }
      } else {
        alert(err.response?.data?.error || "No records available for the selected filters.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append("category", selectedCategory);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";

      const response = await axios.get(`${API}/api/expenses/export-data${qs}`);
      const data = response.data;

      if (!data.records || data.records.length === 0) {
        alert("No records available for the selected filters.");
        return;
      }

      const doc = new jsPDF({ orientation: "portrait" });

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text(data.shopName || "My Slipper Shop", 14, 15);

      doc.setFontSize(12);
      doc.text("Expenses Report", 14, 22);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`, 14, 28);
      doc.text(`Generated Date: ${new Date().toLocaleString()}`, 14, 33);
      
      const activeFilters = [];
      if (selectedCategory) activeFilters.push(`Category: "${selectedCategory}"`);
      if (searchQuery.trim()) activeFilters.push(`Search: "${searchQuery.trim()}"`);
      if (activeFilters.length > 0) {
        doc.text(`Applied Filters: ${activeFilters.join(", ")}`, 14, 38);
      }

      let yPos = activeFilters.length > 0 ? 44 : 39;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("SUMMARY STATISTICS:", 14, yPos);
      yPos += 5;

      const summaryData = [
        [
          `Total Expense Records: ${data.summary.totalRecords}`,
          `Total Expense Amount: INR ${Number(data.summary.totalAmount).toFixed(2)}`
        ]
      ];

      autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: "grid",
        styles: { fontSize: 8.5, fontStyle: "bold", cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } }
      });

      yPos = doc.lastAutoTable.finalY + 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DETAILED EXPENSE RECORDS:", 14, yPos);
      yPos += 4;

      const tableHeaders = [
        ["Expense Date", "Expense Name", "Category", "Amount (Rs.)", "Description / Notes"]
      ];

      const tableRows = data.records.map(row => {
        const dObj = row.expense_date ? new Date(row.expense_date) : null;
        return [
          dObj ? dObj.toLocaleDateString("en-IN") : "-",
          row.expense_name || "-",
          row.category || "-",
          `Rs.${Number(row.amount || 0).toFixed(2)}`,
          row.description || "-"
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: tableHeaders,
        body: tableRows,
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], fontSize: 8.5 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 28, halign: "center" },
          1: { cellWidth: 45 },
          2: { cellWidth: 32, halign: "center" },
          3: { cellWidth: 30, halign: "right" },
          4: { cellWidth: 47 }
        },
        didDrawPage: (dataArg) => {
          const totalPages = doc.internal.getNumberOfPages();
          const pageCurrent = dataArg.pageNumber;
          doc.setFontSize(8);
          doc.setFont("Helvetica", "normal");
          doc.text(
            `Page ${pageCurrent} of ${totalPages}`,
            doc.internal.pageSize.width - 25,
            doc.internal.pageSize.height - 10
          );
        }
      });

      doc.save(`Expenses_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("Export PDF error:", err);
      alert(err.response?.data?.error || "Failed to generate PDF report.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setModalMode("add");
    setSelectedExpense(null);
    setExpenseName("");
    setCategory("");
    setAmount("");
    // Default to today's date in local time (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0];
    setExpenseDate(today);
    setDescription("");
    setModalError("");
    setShowModal(true);
  };

  const handleOpenEditModal = (exp) => {
    setModalMode("edit");
    setSelectedExpense(exp);
    setExpenseName(exp.expense_name);
    setCategory(exp.category);
    setAmount(exp.amount.toString());
    // Format date correctly to YYYY-MM-DD
    const dateStr = exp.expense_date ? exp.expense_date.split("T")[0] : "";
    setExpenseDate(dateStr);
    setDescription(exp.description || "");
    setModalError("");
    setShowModal(true);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();

    if (!expenseName.trim() || !category || !amount || !expenseDate) {
      setModalError("Please fill in all required fields.");
      return;
    }

    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal < 0) {
      setModalError("Amount must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    setModalError("");

    const url = modalMode === "add"
      ? `${API}/api/expenses`
      : `${API}/api/expenses/${selectedExpense.id}`;

    const payload = {
      expense_name: expenseName.trim(),
      category,
      amount: amountVal,
      expense_date: expenseDate,
      description: description.trim()
    };

    const request = modalMode === "add"
      ? axios.post(url, payload)
      : axios.put(url, payload);

    request
      .then(() => {
        setShowModal(false);
        fetchExpenses();
        setAlert({
          type: "success",
          message: `Successfully ${modalMode === "add" ? "recorded" : "updated"} expense "${expenseName.trim()}"`
        });
      })
      .catch((err) => {
        setModalError(err.response?.data?.error || "An error occurred while saving the expense.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const handleDeleteExpense = (exp) => {
    if (!window.confirm(`Are you sure you want to delete the expense "${exp.expense_name}"?`)) {
      return;
    }

    axios
      .delete(`${API}/api/expenses/${exp.id}`)
      .then(() => {
        fetchExpenses();
        setAlert({
          type: "success",
          message: `Successfully deleted expense "${exp.expense_name}".`
        });
      })
      .catch((err) => {
        setAlert({
          type: "danger",
          message: err.response?.data?.error || "Failed to delete expense."
        });
      });
  };

  // Helper to format Date nicely
  const formatDateString = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  // Summary logic
  const totalExpensesSum = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">Expense Tracker</h1>
          <p className="text-[18px] font-medium text-brand-subtext mt-1">Audit, categorize, and record operating expenses for the shop</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-brand-danger hover:bg-red-100 transition-colors shadow-sm"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </button>
          <button
            onClick={fetchExpenses}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
            title="Refresh List"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 rounded-xl bg-brand-accent px-5 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all"
          >
            <Plus className="h-5 w-5" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Status alerts */}
      {alert.message && (
        <div className={`rounded-xl p-4 text-[15px] font-bold border flex items-start gap-2.5 ${
          alert.type === "success"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-brand-danger border-red-200"
        }`}>
          {alert.type === "danger" ? <AlertTriangle className="h-5 w-5 shrink-0 text-brand-danger" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
          <div>{alert.message}</div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="glass-card rounded-2xl p-6 shadow-premium space-y-4 bg-white border border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-6 w-6 text-brand-accent" />
            <h3 className="text-[24px] font-bold text-brand-text">Filter Expenses</h3>
          </div>
          {(selectedCategory || startDate || endDate || searchQuery) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[15px] font-bold text-brand-accent hover:text-blue-600 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Text Search */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Search</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center">
                <Search className="h-5 w-5 text-brand-subtext" />
              </span>
              <input
                type="text"
                placeholder="Search expense name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl border border-brand-border bg-white pl-10 pr-3 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">From Date</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center">
                <Calendar className="h-5 w-5 text-brand-subtext" />
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-brand-border bg-white pl-10 pr-3 text-[16px] font-medium outline-none focus:border-brand-primary/60"
              />
            </div>
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">To Date</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center">
                <Calendar className="h-5 w-5 text-brand-subtext" />
              </span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-brand-border bg-white pl-10 pr-3 text-[16px] font-medium outline-none focus:border-brand-primary/60"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Expenses List Ledger Card */}
      <div className="glass-card rounded-2xl p-7 shadow-premium bg-white border border-slate-100">
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-6 w-6 text-brand-accent" />
          <h3 className="text-[24px] font-bold text-brand-text">Active Expense Log</h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-36 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
              <span className="text-[15px] font-bold uppercase tracking-wider text-brand-text">No expenses found.</span>
              <p className="text-[14px] text-brand-subtext mt-1 font-medium">Try adding a new expense or updating your filter terms.</p>
            </div>
          ) : (
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Expense Name</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5 text-right">Amount</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-brand-accent text-[15px]">{formatDateString(exp.expense_date)}</td>
                    <td className="px-5 py-3.5 text-[15px]">{exp.expense_name}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-3 py-1 rounded-full text-[14px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wide">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-brand-text text-[15px]">₹{Number(exp.amount).toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-normal text-brand-subtext max-w-xs truncate text-[15px]" title={exp.description}>
                      {exp.description || "-"}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[14px]">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handleOpenEditModal(exp)}
                          className="flex items-center gap-1 text-brand-accent hover:text-blue-600 transition-colors font-bold text-[14px]"
                          title="Edit"
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp)}
                          className="flex items-center gap-1 text-brand-danger hover:text-red-600 transition-colors font-bold text-[14px]"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Expenses Summary Box */}
        {!loading && expenses.length > 0 && (
          <div className="mt-6 flex items-center justify-end border-t border-brand-border pt-4">
            <div className="flex items-center gap-4 bg-brand-light rounded-xl px-6 py-3.5 border border-brand-accent/10">
              <span className="text-[15px] font-bold uppercase tracking-wider text-brand-subtext">Total Expenses</span>
              <span className="text-[24px] font-bold text-brand-accent">₹{totalExpensesSum.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal Dialog Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-brand-border shadow-premium overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-border px-6 py-4 bg-slate-50/50">
              <h3 className="text-[20px] font-bold text-brand-text uppercase tracking-wider">
                {modalMode === "add" ? "Record New Expense" : "Edit Expense Log"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-brand-subtext hover:text-brand-text transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleModalSubmit} className="p-6 space-y-4">
              {/* Modal Error */}
              {modalError && (
                <div className="rounded-xl p-3 text-[14px] font-bold border bg-red-50 text-brand-danger border-red-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-brand-danger" />
                  <div>{modalError}</div>
                </div>
              )}

              {/* Expense Name */}
              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Expense Name <span className="text-brand-danger">*</span>
                </label>
                <input
                  type="text"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  placeholder="e.g. Electricity Bill, Stationery items"
                  className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                  required
                  autoFocus
                />
              </div>

              {/* Category & Amount */}
              <div className="grid grid-cols-2 gap-4">
                {/* Category */}
                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    Category <span className="text-brand-danger">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    Amount (₹) <span className="text-brand-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Date <span className="text-brand-danger">*</span>
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context or notes..."
                  rows="3"
                  className="w-full rounded-xl border border-brand-border bg-white p-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-brand-border bg-white text-[15px] font-bold text-brand-subtext hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-brand-accent text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all disabled:opacity-55"
                >
                  {submitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Expenses;
