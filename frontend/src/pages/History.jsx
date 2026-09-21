import { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
const API = import.meta.env.VITE_API_URL;
import { 
  FileSpreadsheet, 
  Printer, 
  Calendar, 
  Coins,
  RefreshCw,
  FileText,
  AlertTriangle
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";

function History() {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");

  const [activeTab, setActiveTab] = useState("sales");
  const [salesData, setSalesData] = useState([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0
  });

  // Supplier Reports states
  const [supplierReports, setSupplierReports] = useState({ totals: {}, rows: [] });
  const [reportsLoading, setReportsLoading] = useState(false);

  // Activity Log states
  const [activityLogs, setActivityLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const getFormattedDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const applyQuickFilter = (filterVal) => {
    const today = new Date();
    if (filterVal === "today") {
      const todayStr = getFormattedDate(today);
      setStartDate(todayStr);
      setEndDate(todayStr);
      setQuickFilter("today");
    } else if (filterVal === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yesterdayStr = getFormattedDate(yesterday);
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
      setQuickFilter("yesterday");
    } else if (filterVal === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7);
      setStartDate(getFormattedDate(weekAgo));
      setEndDate(getFormattedDate(today));
      setQuickFilter("week");
    } else if (filterVal === "month") {
      const monthAgo = new Date();
      monthAgo.setDate(today.getDate() - 30);
      setStartDate(getFormattedDate(monthAgo));
      setEndDate(getFormattedDate(today));
      setQuickFilter("month");
    } else if (filterVal === "all") {
      setStartDate("");
      setEndDate("");
      setQuickFilter("all");
    }
  };

  const fetchReportsData = () => {
    setLoading(true);
    let paramsList = [];
    if (startDate && endDate) {
      paramsList.push("filter=custom");
      paramsList.push(`startDate=${startDate}`);
      paramsList.push(`endDate=${endDate}`);
    }
    if (searchQuery.trim() !== "") {
      paramsList.push(`search=${encodeURIComponent(searchQuery.trim())}`);
    }

    const queryString = paramsList.length > 0 ? `?${paramsList.join("&")}` : "";

    axios
      .get(`${API}/api/sales${queryString}`)
      .then((res) => {
        if (res.data) {
          setSalesData(res.data.records || []);
          setStats({
            totalSales: res.data.stats?.totalSales || 0,
            totalRevenue: res.data.stats?.totalRevenue || 0
          });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching sales history:", err);
        setLoading(false);
      });
  };

  const fetchSupplierReports = () => {
    setReportsLoading(true);
    let paramsList = [];
    if (startDate && endDate) {
      paramsList.push(`startDate=${startDate}`);
      paramsList.push(`endDate=${endDate}`);
    }
    if (searchQuery.trim() !== "") {
      paramsList.push(`supplier=${encodeURIComponent(searchQuery.trim())}`);
    }
    const queryString = paramsList.length > 0 ? `?${paramsList.join("&")}` : "";

    axios
      .get(`${API}/api/reports/supplier${queryString}`)
      .then((res) => {
        if (res.data) {
          setSupplierReports(res.data);
        }
        setReportsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading supplier reports:", err);
        setReportsLoading(false);
      });
  };

  const fetchActivityLogs = () => {
    setLogsLoading(true);
    let paramsList = [];
    if (startDate && endDate) {
      paramsList.push(`startDate=${startDate}`);
      paramsList.push(`endDate=${endDate}`);
    }
    if (searchQuery.trim() !== "") {
      paramsList.push(`search=${encodeURIComponent(searchQuery.trim())}`);
    }
    const queryString = paramsList.length > 0 ? `?${paramsList.join("&")}` : "";

    axios
      .get(`${API}/api/activity-log${queryString}`)
      .then((res) => {
        if (res.data) {
          setActivityLogs(res.data);
        }
        setLogsLoading(false);
      })
      .catch((err) => {
        console.error("Error loading activity logs:", err);
        setLogsLoading(false);
      });
  };

  // Re-fetch reports depending on active tab and filters
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (activeTab === "sales") {
        fetchReportsData();
      } else if (activeTab === "reports") {
        fetchSupplierReports();
      } else if (activeTab === "activity") {
        fetchActivityLogs();
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [startDate, endDate, searchQuery, activeTab]);

  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setQuickFilter("all");
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const paramsList = [];
      if (startDate) paramsList.push(`startDate=${startDate}`);
      if (endDate) paramsList.push(`endDate=${endDate}`);
      if (searchQuery.trim() !== "") {
        paramsList.push(`search=${encodeURIComponent(searchQuery.trim())}`);
      }
      paramsList.push(`tab=${activeTab}`);
      const queryString = paramsList.length > 0 ? `?${paramsList.join("&")}` : "";

      const response = await axios.get(`${API}/api/reports/export-excel${queryString}`, {
        responseType: "blob"
      });

      if (response.headers["content-type"]?.includes("application/json")) {
        const text = await response.data.text();
        const errObj = JSON.parse(text);
        alert(errObj.error || "Export failed.");
        setLoading(false);
        return;
      }

      const blob = new Blob([response.data], { type: response.headers["content-type"] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      let filename = `SlipperShop_${activeTab}_Report.xlsx`;
      const disposition = response.headers["content-disposition"];
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, "");
        }
      }

      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Excel error:", err);
      if (err.response && err.response.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const errObj = JSON.parse(text);
          alert(errObj.error || "No records available for the selected filters.");
        } catch (e) {
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
      const paramsList = [];
      if (startDate) paramsList.push(`startDate=${startDate}`);
      if (endDate) paramsList.push(`endDate=${endDate}`);
      if (searchQuery.trim() !== "") {
        paramsList.push(`search=${encodeURIComponent(searchQuery.trim())}`);
      }
      paramsList.push(`tab=${activeTab}`);
      const queryString = paramsList.length > 0 ? `?${paramsList.join("&")}` : "";

      const response = await axios.get(`${API}/api/reports/export-data${queryString}`);
      const data = response.data;

      if (!data.records || data.records.length === 0) {
        alert("No records available for the selected filters.");
        setLoading(false);
        return;
      }

      const doc = new jsPDF({ orientation: activeTab === "sales" ? "landscape" : "portrait" });

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.text(data.shopName || "My Slipper Shop", 14, 15);

      doc.setFontSize(12);
      let reportTitle = "";
      if (activeTab === "sales") reportTitle = "Sales Invoice History Report";
      if (activeTab === "reports") reportTitle = "Supplier Business Performance Report";
      if (activeTab === "activity") reportTitle = "System Activity Logs Report";
      doc.text(reportTitle, 14, 22);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`, 14, 28);
      doc.text(`Generated Date: ${new Date().toLocaleString()}`, 14, 33);
      if (searchQuery.trim() !== "") {
        doc.text(`Applied Filters: Search: "${searchQuery}"`, 14, 38);
      }

      let yPos = searchQuery.trim() !== "" ? 44 : 39;

      if (activeTab === "sales") {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text("SUMMARY STATISTICS:", 14, yPos);
        yPos += 5;

        const summaryData = [
          [
            `Total Bills: ${data.summary.totalBills}`,
            `Total Items: ${data.summary.totalItemsSold}`,
            `Total Sales: INR ${data.summary.totalSales.toFixed(2)}`,
            `Total Discount: INR ${data.summary.totalDiscount.toFixed(2)}`
          ],
          [
            `Total GST: INR ${data.summary.totalGst.toFixed(2)}`,
            `Total Purchase Cost: INR ${data.summary.totalPurchaseCost.toFixed(2)}`,
            `Total Profit: INR ${data.summary.totalProfit.toFixed(2)}`,
            ""
          ],
          [
            `Cash: INR ${data.summary.cashCollection.toFixed(2)}`,
            `UPI: INR ${data.summary.upiCollection.toFixed(2)}`,
            `Card: INR ${data.summary.cardCollection.toFixed(2)}`,
            `Other: INR ${data.summary.otherCollection.toFixed(2)}`
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

        const tableHeaders = [
          ["Invoice No", "Date", "Customer", "Product", "Article No", "Qty", "Rate", "Discount", "GST", "Amount", "Payment"]
        ];

        const tableRows = data.records.map(row => [
          row.bill_no,
          new Date(row.date).toLocaleDateString("en-IN"),
          row.customer_name,
          row.product_name,
          row.article_number,
          row.quantity,
          `Rs.${row.selling_price.toFixed(2)}`,
          `Rs.${row.discount.toFixed(2)}`,
          `Rs.${row.gst.toFixed(2)}`,
          `Rs.${row.grand_total.toFixed(2)}`,
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
            2: { cellWidth: 32 },
            3: { cellWidth: 42 },
            4: { cellWidth: 24 },
            5: { cellWidth: 10, halign: "center" },
            6: { cellWidth: 22, halign: "right" },
            7: { cellWidth: 22, halign: "right" },
            8: { cellWidth: 20, halign: "right" },
            9: { cellWidth: 24, halign: "right" },
            10: { cellWidth: 18, halign: "center" }
          }
        });
      } else if (activeTab === "reports") {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text("SUPPLIER BUSINESS PERFORMANCE SUMMARY:", 14, yPos);
        yPos += 5;

        const summaryData = [
          [
            `Total Purchase Cost: INR ${data.summary.totalPurchaseCost.toFixed(2)}`,
            `Total Sales Revenue: INR ${data.summary.totalSalesAmount.toFixed(2)}`,
            `Total Profit: INR ${data.summary.totalProfit.toFixed(2)}`
          ]
        ];

        autoTable(doc, {
          startY: yPos,
          body: summaryData,
          theme: "grid",
          styles: { fontSize: 9, fontStyle: "bold", cellPadding: 3 }
        });

        yPos = doc.lastAutoTable.finalY + 8;

        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.text("DETAILED SUPPLIER PERFORMANCE:", 14, yPos);
        yPos += 4;

        const tableHeaders = [
          ["Supplier", "Purchased Qty", "Sold Qty", "Available Stock", "Purchase Cost", "Sales Revenue", "Profit/Loss"]
        ];

        const tableRows = data.records.map(row => [
          row.supplier,
          `${row.purchasedQty} pairs`,
          `${row.soldQty} pairs`,
          `${row.availableStock} pairs`,
          `Rs.${row.purchaseCost.toFixed(2)}`,
          `Rs.${row.salesAmount.toFixed(2)}`,
          `Rs.${row.profit.toFixed(2)}`
        ]);

        autoTable(doc, {
          startY: yPos,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
          bodyStyles: { fontSize: 8.5 }
        });
      } else if (activeTab === "activity") {
        const tableHeaders = [
          ["Date", "Time", "User", "Action", "Module", "Description"]
        ];

        const tableRows = data.records.map(row => {
          const dObj = new Date(row.created_at);
          return [
            dObj.toLocaleDateString("en-IN"),
            dObj.toLocaleTimeString("en-IN"),
            row.user,
            row.action,
            row.module,
            row.description
          ];
        });

        autoTable(doc, {
          startY: yPos,
          head: tableHeaders,
          body: tableRows,
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
          bodyStyles: { fontSize: 8.5 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 25 },
            2: { cellWidth: 18 },
            3: { cellWidth: 32 },
            4: { cellWidth: 32 },
            5: { cellWidth: 50 }
          }
        });
      }

      doc.save(`SlipperShop_${activeTab}_Report_${new Date().toISOString().slice(0, 10)}.pdf`);

    } catch (err) {
      console.error("Export PDF error:", err);
      alert(err.response?.data?.error || "Failed to generate PDF report.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up font-semibold text-brand-text">
      {/* Date Filters Bar (Hidden when printing) */}
      <div className="glass-card rounded-2xl p-6 shadow-premium space-y-4 no-print bg-white border border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-brand-accent" />
            <h2 className="text-[24px] font-bold text-brand-text">Filters & Actions</h2>
          </div>
          <div className="flex items-center gap-3">
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[15px] font-bold text-brand-accent hover:text-blue-600 transition-colors mr-2"
              >
                Reset Filters
              </button>
            )}
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
              className="flex items-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-colors"
            >
              <Printer className="h-5 w-5" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="flex flex-wrap gap-2 pt-1 pb-2">
          {[
            { label: "Today", value: "today" },
            { label: "Yesterday", value: "yesterday" },
            { label: "This Week", value: "week" },
            { label: "This Month", value: "month" },
            { label: "All", value: "all" },
          ].map((btn) => {
            const isActive = quickFilter === btn.value;
            return (
              <button
                key={btn.value}
                type="button"
                onClick={() => applyQuickFilter(btn.value)}
                className={`rounded-xl px-5 py-2.5 text-[15px] font-bold transition-all duration-200 ${
                  isActive
                    ? "bg-brand-accent text-white shadow-md shadow-brand-accent/20"
                    : "bg-white border border-brand-border text-brand-subtext hover:bg-slate-50 hover:text-brand-text"
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3 max-w-3xl">
          {/* Search Box */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
              {activeTab === "reports" ? "Search Supplier" : "Global Search"}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === "reports" ? "Supplier Name..." : "Invoice, customer, details..."}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setQuickFilter("");
              }}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setQuickFilter("");
              }}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>
        </div>
      </div>

      {/* Tab Selector Buttons */}
      <div className="flex border-b border-brand-border bg-white rounded-2xl p-2 gap-2 no-print shadow-premium max-w-xl border border-slate-100">
        {[
          { id: "sales", label: "Sales Invoice History" },
          { id: "reports", label: "Supplier Business Reports" },
          { id: "activity", label: "System Activity Logs" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchQuery("");
            }}
            className={`px-5 py-3.5 rounded-xl text-[16px] font-bold transition-all duration-200 flex-1 ${
              activeTab === tab.id
                ? "bg-brand-accent text-white shadow-md shadow-brand-accent/20"
                : "text-brand-subtext hover:bg-slate-50 hover:text-brand-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Printable Report Header */}
      <div className="hidden print:block text-center border-b border-brand-border pb-4 mb-6">
        {settings.shop_logo && (
          <div className="mx-auto mb-2.5 h-12 w-12 overflow-hidden rounded-xl border border-slate-100 flex items-center justify-center p-0.5 shadow-sm">
            <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <h2 className="text-[24px] font-bold text-brand-text uppercase tracking-wider">{settings.shop_name} Reports Panel</h2>
        <p className="text-[15px] font-semibold text-brand-subtext mt-1">
          Tab Report: {activeTab === "sales" ? "Sales History" : activeTab === "reports" ? "Supplier Business Analysis" : "System Audit Trails"}
        </p>
        <p className="text-[15px] font-semibold text-brand-subtext mt-0.5">
          Period: {startDate || "Lifetime"} {endDate ? `to ${endDate}` : ""}
        </p>
        <p className="text-[14px] text-brand-subtext mt-0.5">Print Date: {new Date().toLocaleDateString()}</p>
      </div>

      {/* Render Active Tab Content */}
      <div className="space-y-6">
        
        {/* VIEW 1: SALES INVOICE HISTORY */}
        {activeTab === "sales" && (
          <>
            <div className="glass-card rounded-2xl p-7 shadow-premium bg-white border border-slate-100">
              <div className="mb-4 flex items-center justify-between no-print">
                <div className="flex items-center gap-2">
                  <FileText className="h-6 w-6 text-brand-accent" />
                  <h3 className="text-[24px] font-bold text-brand-text">Sales Invoice Ledger</h3>
                </div>
                <button
                  type="button"
                  onClick={fetchReportsData}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="flex h-36 items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                ) : salesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
                    <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
                    <span className="text-[15px] font-bold uppercase tracking-wider text-brand-text">No invoice records found.</span>
                  </div>
                ) : (
                  <table className="w-full text-left text-[15px]">
                    <thead>
                      <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                        <th className="px-5 py-3.5">Bill No</th>
                        <th className="px-5 py-3.5">Article Number</th>
                        <th className="px-5 py-3.5">Date</th>
                        <th className="px-5 py-3.5">Customer</th>
                        <th className="px-5 py-3.5">Mobile</th>
                        <th className="px-5 py-3.5 text-right">Amount</th>
                        <th className="px-5 py-3.5 text-center">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                      {salesData.map((row) => (
                        <tr key={row.bill_no} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-brand-accent uppercase text-[15px]">{row.bill_no}</td>
                          <td className="px-5 py-3.5 text-brand-text font-bold text-[15px]">{row.article_numbers || "-"}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-[15px]">{new Date(row.date).toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-[15px]">{row.customer_name || "Walk-in Customer"}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-[15px]">{row.customer_phone || "-"}</td>
                          <td className="px-5 py-3.5 text-right font-bold text-[15px]">₹{parseFloat(row.total_amount).toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="rounded-full bg-brand-light px-3 py-1 text-[14px] font-bold text-brand-accent uppercase">
                              {row.payment_method}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Summary Footer Statistics */}
            <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
              <div className="glass-card rounded-2xl p-6 shadow-premium bg-brand-light/20 border border-brand-border/60 bg-white">
                <span className="text-[15px] font-bold uppercase tracking-wider text-brand-subtext">Total Bills</span>
                <h3 className="text-[36px] font-bold text-brand-text mt-1">{stats.totalSales} Bills</h3>
              </div>
              <div className="glass-card rounded-2xl p-6 shadow-premium bg-emerald-50/20 border border-emerald-200/60 bg-white">
                <span className="text-[15px] font-bold uppercase tracking-wider text-emerald-700/80">Total Sales</span>
                <h3 className="text-[36px] font-bold text-emerald-600 mt-1">
                  ₹{Number(stats.totalRevenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: SUPPLIER BUSINESS REPORTS */}
        {activeTab === "reports" && (
          <>
            <div className="glass-card rounded-2xl p-7 shadow-premium bg-white border border-slate-100">
              <div className="mb-4 flex items-center justify-between no-print">
                <div className="flex items-center gap-2">
                  <Coins className="h-6 w-6 text-brand-accent" />
                  <h3 className="text-[24px] font-bold text-brand-text">Supplier-wise Performance Analysis</h3>
                </div>
                <button
                  type="button"
                  onClick={fetchSupplierReports}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                {reportsLoading ? (
                  <div className="flex h-36 items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                ) : !supplierReports.rows || supplierReports.rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
                    <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
                    <span className="text-[15px] font-bold uppercase tracking-wider text-brand-text">No supplier performance statistics available.</span>
                  </div>
                ) : (
                  <table className="w-full text-left text-[15px]">
                    <thead>
                      <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                        <th className="px-5 py-3.5">Supplier Name</th>
                        <th className="px-5 py-3.5 text-center">Purchased Qty</th>
                        <th className="px-5 py-3.5 text-center">Sold Qty</th>
                        <th className="px-5 py-3.5 text-center">Available Stock</th>
                        <th className="px-5 py-3.5 text-right">Purchase Cost (COGS)</th>
                        <th className="px-5 py-3.5 text-right">Sales Revenue</th>
                        <th className="px-5 py-3.5 text-right">Profit / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                      {supplierReports.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-brand-accent uppercase text-[15px]">{row.supplier}</td>
                          <td className="px-5 py-3.5 text-center text-[15px]">{row.purchasedQty} pairs</td>
                          <td className="px-5 py-3.5 text-center text-[15px]">{row.soldQty} pairs</td>
                          <td className="px-5 py-3.5 text-center text-[15px]">{row.availableStock} pairs</td>
                          <td className="px-5 py-3.5 text-right text-slate-500 text-[15px]">₹{parseFloat(row.purchaseCost).toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-right font-bold text-[15px]">₹{parseFloat(row.salesAmount).toFixed(2)}</td>
                          <td className={`px-5 py-3.5 text-right font-bold text-[15px] ${row.profit > 0 ? "text-emerald-600" : "text-brand-text"}`}>
                            ₹{parseFloat(row.profit).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Supplier Reports Summary Footer Cards */}
            {supplierReports.totals && (
              <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
                <div className="glass-card rounded-2xl p-6 shadow-premium bg-slate-50/55 border border-brand-border/60 bg-white">
                  <span className="text-[15px] font-bold uppercase tracking-wider text-brand-subtext">Total Purchase COGS</span>
                  <h3 className="text-[34px] font-bold text-brand-text mt-1">
                    ₹{Number(supplierReports.totals.totalPurchaseCost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="glass-card rounded-2xl p-6 shadow-premium bg-blue-50/20 border border-blue-200/50 bg-white">
                  <span className="text-[15px] font-bold uppercase tracking-wider text-brand-primary">Total Revenue</span>
                  <h3 className="text-[34px] font-bold text-brand-accent mt-1">
                    ₹{Number(supplierReports.totals.totalSalesAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </h3>
                </div>
                <div className="glass-card rounded-2xl p-6 shadow-premium bg-emerald-50/20 border border-emerald-200/60 bg-white">
                  <span className="text-[15px] font-bold uppercase tracking-wider text-emerald-700/80">Total Margin Profit</span>
                  <h3 className="text-[34px] font-bold text-emerald-600 mt-1">
                    ₹{Number(supplierReports.totals.totalProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>
            )}
          </>
        )}

        {/* VIEW 3: SYSTEM ACTIVITY LOGS */}
        {activeTab === "activity" && (
          <div className="glass-card rounded-2xl p-7 shadow-premium bg-white border border-slate-100">
            <div className="mb-4 flex items-center justify-between no-print">
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-brand-accent" />
                <h3 className="text-[24px] font-bold text-brand-text">System Activity Logs</h3>
              </div>
              <button
                type="button"
                onClick={fetchActivityLogs}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              {logsLoading ? (
                <div className="flex h-36 items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
                  <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
                  <span className="text-[15px] font-bold uppercase tracking-wider text-brand-text">No system activity logs recorded.</span>
                </div>
              ) : (
                <table className="w-full text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                      <th className="px-5 py-3.5">Time</th>
                      <th className="px-5 py-3.5 text-center">Type</th>
                      <th className="px-5 py-3.5">Log Message Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                    {activityLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 text-[15px]">{new Date(row.created_at).toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`inline-block rounded-full px-3 py-1 text-[14px] font-bold uppercase ${
                            row.type === "addition" 
                              ? "bg-blue-50 text-blue-600 border border-blue-100" 
                              : row.type === "edit"
                                ? "bg-amber-50 text-amber-600 border border-amber-100"
                                : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          }`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-brand-text font-bold text-[15px]">{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default History;
