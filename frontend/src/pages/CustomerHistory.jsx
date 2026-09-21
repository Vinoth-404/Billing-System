import { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  UsersRound,
  Search,
  Calendar,
  Eye,
  X,
  Receipt,
  FileSpreadsheet,
  Printer
} from "lucide-react";

const API = import.meta.env.VITE_API_URL;

function CustomerHistory() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Details Modal State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailRecords, setDetailRecords] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailStartDate, setDetailStartDate] = useState("");
  const [detailEndDate, setDetailEndDate] = useState("");
  const [detailError, setDetailError] = useState(null);

  const fetchCustomers = () => {
    setLoading(true);
    axios
      .get(`${API}/api/customers`, {
        params: {
          search: search.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined
        }
      })
      .then((res) => {
        setCustomers(res.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching customers:", err);
        setLoading(false);
      });
  };

  const fetchCustomerDetails = (id) => {
    if (!id) return;
    setDetailLoading(true);
    setDetailError(null);
    axios
      .get(`${API}/api/customers/${encodeURIComponent(id)}/history`, {
        params: {
          search: detailSearch.trim(),
          startDate: detailStartDate || undefined,
          endDate: detailEndDate || undefined
        }
      })
      .then((res) => {
        setDetailRecords(res.data || []);
        setDetailLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching customer details:", err);
        setDetailError("Failed to load purchase history. Please try again.");
        setDetailLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, startDate, endDate]);

  useEffect(() => {
    if (selectedCustomer) {
      const custId = selectedCustomer.customer_phone || selectedCustomer.customer_name;
      fetchCustomerDetails(custId);
    }
  }, [selectedCustomer, detailSearch, detailStartDate, detailEndDate]);

  // Real-time update after checkout
  useEffect(() => {
    const handleUpdate = () => {
      fetchCustomers();
      if (selectedCustomer) {
        const custId = selectedCustomer.customer_phone || selectedCustomer.customer_name;
        fetchCustomerDetails(custId);
      }
    };
    window.addEventListener("customer-updated", handleUpdate);
    window.addEventListener("stock-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("customer-updated", handleUpdate);
      window.removeEventListener("stock-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [selectedCustomer, detailSearch, detailStartDate, detailEndDate]);

  // Close details modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedCustomer) {
        setSelectedCustomer(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCustomer]);

  const handleResetFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
  };

  const handleResetDetailFilters = () => {
    setDetailSearch("");
    setDetailStartDate("");
    setDetailEndDate("");
  };

  const openCustomer = (cust) => {
    setSelectedCustomer(cust);
    setDetailSearch("");
    setDetailStartDate("");
    setDetailEndDate("");
    setDetailRecords([]);
    setDetailError(null);
  };

  // ============================================================
  // MAIN LIST EXPORTS â€” same pattern as Sales History via backend
  // ============================================================
  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const response = await axios.get(`${API}/api/customers/export-excel${qs}`, {
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
      let filename = `CustomerHistory_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
      if (search.trim()) params.append("search", search.trim());
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const response = await axios.get(`${API}/api/customers/export-data${qs}`);
      const data = response.data;

      if (!data.records || data.records.length === 0) {
        alert("No records available for the selected filters.");
        return;
      }

      // Exact same jsPDF + autoTable style as Sales History
      const doc = new jsPDF({ orientation: "landscape" });

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text(data.shopName || "My Slipper Shop", 14, 15);

      doc.setFontSize(12);
      doc.text("Customer Purchase History Report", 14, 22);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`, 14, 28);
      doc.text(`Generated Date: ${new Date().toLocaleString()}`, 14, 33);
      if (search.trim() !== "") {
        doc.text(`Applied Filters: Search: "${search}"`, 14, 38);
      }

      let yPos = search.trim() !== "" ? 44 : 39;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("SUMMARY STATISTICS:", 14, yPos);
      yPos += 5;

      const summaryData = [
        [
          `Total Bills: ${data.summary.totalBills}`,
          `Total Items: ${data.summary.totalItemsSold}`,
          `Total Sales: INR ${Number(data.summary.totalSales).toFixed(2)}`,
          `Total Discount: INR ${Number(data.summary.totalDiscount).toFixed(2)}`
        ],
        [
          `Total GST: INR ${Number(data.summary.totalGst).toFixed(2)}`,
          `Grand Total: INR ${Number(data.summary.totalGrandTotal).toFixed(2)}`,
          "",
          ""
        ]
      ];

      autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: "grid",
        styles: { fontSize: 8, fontStyle: "bold", cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 65 }, 2: { cellWidth: 65 }, 3: { cellWidth: 65 } }
      });

      yPos = doc.lastAutoTable.finalY + 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DETAILED RECORDS:", 14, yPos);
      yPos += 4;

      // Same columns as Sales History
      const tableHeaders = [
        ["Invoice No", "Date", "Customer", "Product", "Article No", "Qty", "Rate", "Discount", "GST", "Amount", "Payment"]
      ];

      const tableRows = data.records.map(row => [
        row.bill_no,
        row.date_str,
        `${row.customer_name}${row.customer_phone !== "N/A" ? ` (${row.customer_phone})` : ""}`,
        row.product_name,
        row.article_number || "-",
        row.quantity,
        `Rs.${Number(row.selling_price).toFixed(2)}`,
        `Rs.${Number(row.discount).toFixed(2)}`,
        `Rs.${Number(row.gst).toFixed(2)}`,
        `Rs.${Number(row.grand_total).toFixed(2)}`,
        row.payment_method
      ]);

      autoTable(doc, {
        startY: yPos,
        head: tableHeaders,
        body: tableRows,
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 20 },
          2: { cellWidth: 38 },
          3: { cellWidth: 38 },
          4: { cellWidth: 22 },
          5: { cellWidth: 10, halign: "center" },
          6: { cellWidth: 22, halign: "right" },
          7: { cellWidth: 22, halign: "right" },
          8: { cellWidth: 18, halign: "right" },
          9: { cellWidth: 22, halign: "right" },
          10: { cellWidth: 18, halign: "center" }
        }
      });

      doc.save(`CustomerHistory_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("Export PDF error:", err);
      alert(err.response?.data?.error || "Failed to generate PDF report.");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // DETAIL LEDGER EXPORTS
  // ============================================================
  const handleDetailExportExcel = async () => {
    if (!selectedCustomer) return;
    const custId = selectedCustomer.customer_phone || selectedCustomer.customer_name;
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("search", custId);
      if (detailStartDate) params.append("startDate", detailStartDate);
      if (detailEndDate) params.append("endDate", detailEndDate);

      const response = await axios.get(`${API}/api/customers/export-excel?${params.toString()}`, {
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
      const safeName = (selectedCustomer.customer_name || "Customer").replace(/[^a-zA-Z0-9]/g, "_");
      link.setAttribute("download", `Ledger_${safeName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Detail Excel error:", err);
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const errObj = JSON.parse(text);
          alert(errObj.error || "No records to export.");
        } catch {
          alert("Failed to export Excel.");
        }
      } else {
        alert(err.response?.data?.error || "No records to export.");
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDetailExportPDF = () => {
    if (!selectedCustomer || detailRecords.length === 0) {
      alert("No purchase records to export.");
      return;
    }

    const custName = selectedCustomer.customer_name || "Customer";
    const custPhone = selectedCustomer.customer_phone || "N/A";

    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Customer Purchase Ledger", 14, 15);

    doc.setFontSize(12);
    doc.text(`Customer: ${custName}${custPhone !== "N/A" ? ` | Mobile: ${custPhone}` : ""}`, 14, 22);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated Date: ${new Date().toLocaleString()}`, 14, 28);
    if (detailSearch.trim() !== "") {
      doc.text(`Applied Filters: Search: "${detailSearch}"`, 14, 33);
    }

    const yPos = detailSearch.trim() !== "" ? 39 : 34;

    const tableHeaders = [
      ["Invoice No", "Date", "Customer", "Product", "Article No", "Qty", "Rate", "Discount", "GST", "Amount", "Payment"]
    ];

    const tableRows = detailRecords.map(row => {
      const sp    = Number(row.selling_price || 0);
      const disc  = Number(row.discount || 0);
      const gst   = Number(row.gst || 0);
      const total = Number(row.total_amount || 0);
      return [
        row.bill_no,
        new Date(row.date).toLocaleDateString("en-IN"),
        custName,
        row.product_name || `${row.brand} ${row.type}`,
        row.article_number || "-",
        row.quantity,
        `Rs.${sp.toFixed(2)}`,
        `Rs.${disc.toFixed(2)}`,
        `Rs.${gst.toFixed(2)}`,
        `Rs.${total.toFixed(2)}`,
        row.payment_method
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: tableHeaders,
      body: tableRows,
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 20 },
        2: { cellWidth: 32 },
        3: { cellWidth: 42 },
        4: { cellWidth: 22 },
        5: { cellWidth: 10, halign: "center" },
        6: { cellWidth: 22, halign: "right" },
        7: { cellWidth: 22, halign: "right" },
        8: { cellWidth: 20, halign: "right" },
        9: { cellWidth: 24, halign: "right" },
        10: { cellWidth: 18, halign: "center" }
      }
    });

    const safeName = custName.replace(/[^a-zA-Z0-9]/g, "_");
    doc.save(`Ledger_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[36px] md:text-[44px] font-bold tracking-tight text-brand-text leading-tight">
            Customer History
          </h1>
          <p className="text-[15px] sm:text-[18px] font-medium text-brand-subtext mt-1">
            Track customer bills, aggregate spent, and last purchase logs
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-[15px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Printer className="h-5 w-5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-2xl p-6 shadow-premium bg-white space-y-4">
        <div className="flex items-center gap-2 text-brand-accent mb-2">
          <UsersRound className="h-5 w-5" />
          <h3 className="font-bold text-[16px] uppercase tracking-wider">Search & Filters</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtext" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Name or Mobile..."
              className="h-11 w-full rounded-xl border border-brand-border bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtext" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
              title="From Date"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtext" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white pl-10 pr-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
              title="To Date"
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Customer Table */}
      <div className="glass-card rounded-2xl shadow-premium bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px] border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-slate-50 text-[14px] sm:text-[15px] font-bold uppercase tracking-wider text-brand-subtext">
                <th className="px-6 py-4">Customer Name</th>
                <th className="px-6 py-4">Mobile Number</th>
                <th className="px-6 py-4 text-center">Total Bills</th>
                <th className="px-6 py-4 text-center">Items Purchased</th>
                <th className="px-6 py-4 text-right">Total Amount Spent</th>
                <th className="px-6 py-4 text-center">Last Purchase</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent mx-auto"></div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-brand-subtext font-normal">
                    No customers found matching the search criteria.
                  </td>
                </tr>
              ) : (
                customers.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-bold text-brand-text">{c.customer_name}</td>
                    <td className="px-6 py-4 text-brand-subtext font-bold">
                      {c.customer_phone || <span className="text-slate-300 font-normal">â€”</span>}
                    </td>
                    <td className="px-6 py-4 text-center text-brand-accent font-bold">{c.total_bills}</td>
                    <td className="px-6 py-4 text-center">{c.total_items_purchased} pairs</td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                      ₹{Number(c.total_amount_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-semibold text-brand-subtext">
                      {new Date(c.last_purchase_date).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => openCustomer(c)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-light px-3 text-xs font-bold text-brand-accent hover:bg-blue-100 transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                        View Purchases
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="w-full max-w-5xl h-[85vh] flex flex-col bg-white rounded-2xl border border-brand-border shadow-premium overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-border px-6 py-4 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand-accent">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[20px] font-bold text-brand-text">
                    Purchase Ledger: {selectedCustomer.customer_name}
                  </h3>
                  <p className="text-xs font-bold text-brand-subtext">
                    {selectedCustomer.customer_phone || "No mobile number"}
                    {" · "}
                    {selectedCustomer.total_bills} bill{selectedCustomer.total_bills !== 1 ? "s" : ""}
                    {" · "}
                    ₹{Number(selectedCustomer.total_amount_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} total spent
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDetailExportExcel}
                  disabled={detailLoading}
                  className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Excel
                </button>
                <button
                  onClick={handleDetailExportPDF}
                  disabled={detailLoading || detailRecords.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-brand-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  <Printer className="h-4 w-4" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-border bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors shadow-sm ml-1"
                  title="Close (Esc)"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Filters */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/30 grid gap-3 sm:grid-cols-4 flex-shrink-0">
              <div className="relative col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtext" />
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Filter by Invoice, Brand, Type, or Article No..."
                  className="h-10 w-full rounded-lg border border-brand-border bg-white pl-9 pr-4 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                />
              </div>
              <input
                type="date"
                value={detailStartDate}
                onChange={(e) => setDetailStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                title="From Date"
              />
              <input
                type="date"
                value={detailEndDate}
                onChange={(e) => setDetailEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                title="To Date"
              />
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4">
              {detailError ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
                  <p className="text-brand-danger font-bold text-lg">{detailError}</p>
                  <button
                    onClick={() => {
                      const custId = selectedCustomer.customer_phone || selectedCustomer.customer_name;
                      fetchCustomerDetails(custId);
                    }}
                    className="rounded-xl bg-brand-accent px-5 py-2 text-sm font-bold text-white hover:bg-blue-600 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-brand-border bg-white">
                  <table className="w-full text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-brand-border bg-slate-50 text-[13px] font-bold uppercase tracking-wider text-brand-subtext">
                        <th className="px-4 py-3">Invoice No</th>
                        <th className="px-4 py-3 text-center">Date & Time</th>
                        <th className="px-4 py-3">Article No</th>
                        <th className="px-4 py-3">Item Details</th>
                        <th className="px-4 py-3 text-center">Size / Color</th>
                        <th className="px-4 py-3 text-center">Qty</th>
                        <th className="px-4 py-3 text-right">Selling Rate</th>
                        <th className="px-4 py-3 text-right">Discount</th>
                        <th className="px-4 py-3 text-right">GST</th>
                        <th className="px-4 py-3 text-right">Grand Total</th>
                        <th className="px-4 py-3 text-center">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                      {detailLoading ? (
                        <tr>
                          <td colSpan="11" className="text-center py-8">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent mx-auto"></div>
                          </td>
                        </tr>
                      ) : detailRecords.length === 0 ? (
                        <tr>
                          <td colSpan="11" className="text-center py-12 text-brand-subtext font-normal">
                            No purchase history found for this customer.
                          </td>
                        </tr>
                      ) : (
                        detailRecords.map((r, i) => {
                          // CRITICAL FIX: MySQL DECIMAL columns arrive as strings â€” wrap with Number()
                          const sp    = Number(r.selling_price || 0);
                          const disc  = Number(r.discount || 0);
                          const gst   = Number(r.gst || 0);
                          const total = Number(r.total_amount || 0);
                          return (
                            <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                              <td className="px-4 py-3.5 font-bold text-brand-accent">{r.bill_no}</td>
                              <td className="px-4 py-3.5 text-center text-xs text-brand-subtext whitespace-nowrap">
                                {new Date(r.date).toLocaleDateString("en-IN")}
                                <br />
                                {new Date(r.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                              </td>
                              <td className="px-4 py-3.5 text-xs font-bold uppercase">{r.article_number || "N/A"}</td>
                              <td className="px-4 py-3.5 font-bold whitespace-nowrap">
                                {r.product_name || `${r.brand} ${r.type}`}
                              </td>
                              <td className="px-4 py-3.5 text-center text-xs">
                                S-{r.size} / {r.color}
                              </td>
                              <td className="px-4 py-3.5 text-center">{r.quantity}</td>
                              <td className="px-4 py-3.5 text-right font-medium text-slate-500">
                                ₹{sp.toFixed(2)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-amber-600">
                                ₹{disc.toFixed(2)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-semibold text-blue-600">
                                ₹{gst.toFixed(2)}
                              </td>
                              <td className="px-4 py-3.5 text-right font-bold text-emerald-600">
                                ₹{total.toFixed(2)}
                              </td>
                              <td className="px-4 py-3.5 text-center text-xs whitespace-nowrap">
                                <span className="rounded bg-slate-50 px-2 py-0.5 border border-slate-200">
                                  {r.payment_method}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-brand-border px-6 py-4 bg-slate-50/50 flex justify-between items-center text-xs font-extrabold uppercase text-brand-subtext flex-shrink-0">
              <div>Transactions: {detailRecords.length} line{detailRecords.length !== 1 ? "s" : ""}</div>
              <button
                type="button"
                onClick={handleResetDetailFilters}
                className="text-brand-accent hover:underline font-bold"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerHistory;
