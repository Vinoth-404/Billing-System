import { useState, useEffect } from "react";
import axios from "axios";
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
  const [quickFilter, setQuickFilter] = useState("all");

  const [salesData, setSalesData] = useState([]);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalRevenue: 0
  });

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

  // Re-fetch report summaries whenever the date range updates
  useEffect(() => {
    fetchReportsData();
  }, [startDate, endDate]);

  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setQuickFilter("all");
  };

  const exportToCSV = () => {
    if (salesData.length === 0) return;

    // Header row
    const headers = ["Bill Number", "Date", "Customer Name", "Mobile Number", "Total Amount (INR)", "Payment Mode"];
    
    // Body rows
    const csvRows = salesData.map((row) => [
      row.bill_no,
      new Date(row.date).toLocaleString(),
      row.customer_name || "Walk-in Customer",
      row.customer_phone || "-",
      parseFloat(row.total_amount).toFixed(2),
      row.payment_method
    ]);

    // Construct CSV content
    const csvContent = [headers.join(","), ...csvRows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `SlipperShop_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-slide-up font-semibold text-brand-text">
      {/* Date Filters Bar (Hidden when printing) */}
      <div className="glass-card rounded-2xl p-5 shadow-premium space-y-4 no-print bg-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-accent" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-brand-subtext">Date Filters</h2>
          </div>
          <div className="flex items-center gap-3">
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-bold text-brand-accent hover:text-blue-600 transition-colors mr-2"
              >
                Reset Filters
              </button>
            )}
            <button
              onClick={exportToCSV}
              disabled={salesData.length === 0}
              className="flex items-center gap-1.5 rounded-xl border border-brand-border bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Export Excel
            </button>
            <button
              onClick={handlePrint}
              disabled={salesData.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-brand-accent px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              <Printer className="h-4 w-4" />
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
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 ${
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

        <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
          {/* From Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setQuickFilter("");
              }}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setQuickFilter("");
              }}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>
        </div>
      </div>

      {/* Printable Report Content */}
      <div className="space-y-6">
        {/* Print Only Header Banner */}
        <div className="hidden print:block text-center border-b border-brand-border pb-4 mb-6">
          {settings.shop_logo && (
            <div className="mx-auto mb-2.5 h-12 w-12 overflow-hidden rounded-xl border border-slate-100 flex items-center justify-center p-0.5 shadow-sm">
              <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <h2 className="text-xl font-extrabold text-brand-text uppercase tracking-wider">{settings.shop_name} History</h2>
          <p className="text-xs font-semibold text-brand-subtext mt-1">
            Period: {startDate || "Lifetime"} {endDate ? `to ${endDate}` : ""}
          </p>
          <p className="text-[10px] text-brand-subtext mt-0.5">Print Date: {new Date().toLocaleDateString()}</p>
        </div>

        {/* Transaction Sales Report Table */}
        <div className="glass-card rounded-2xl p-6 shadow-premium bg-white">
          <div className="mb-4 flex items-center justify-between no-print">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand-accent" />
              <h3 className="text-sm font-extrabold text-brand-text">Sales Report Table</h3>
            </div>
            <button
              type="button"
              onClick={fetchReportsData}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
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
                <span className="text-xs font-bold uppercase tracking-wider text-brand-text">No transaction records found.</span>
                <p className="text-[10px] text-brand-subtext mt-1 font-semibold">Try modifying your filter dates.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-brand-border bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                    <th className="px-4 py-3">Bill No</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                  {salesData.map((row) => (
                    <tr key={row.bill_no} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3.5 font-bold text-brand-accent uppercase">{row.bill_no}</td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {new Date(row.date).toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5">{row.customer_name || "Walk-in Customer"}</td>
                      <td className="px-4 py-3.5 text-slate-500">{row.customer_phone || "-"}</td>
                      <td className="px-4 py-3.5 text-right font-extrabold">₹{parseFloat(row.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="rounded bg-brand-light px-2 py-0.5 text-[10px] font-extrabold text-brand-accent uppercase">
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
          <div className="glass-card rounded-2xl p-5 shadow-premium bg-brand-light/20 border border-brand-border/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Total Bills</span>
            <h3 className="text-2xl font-extrabold text-brand-text mt-1">{stats.totalSales} Bills</h3>
          </div>
          <div className="glass-card rounded-2xl p-5 shadow-premium bg-emerald-50/20 border border-emerald-200/60">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">Total Sales</span>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">
              ₹{Number(stats.totalRevenue).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

      </div>
    </div>
  );
}

export default History;
