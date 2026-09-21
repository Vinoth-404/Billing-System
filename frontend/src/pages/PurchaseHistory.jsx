import { useState, useEffect } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ShoppingCart, Search, Calendar, RefreshCw, FileSpreadsheet, FileText } from "lucide-react";
import { useSettings } from "../context/SettingsContext";

const API = import.meta.env.VITE_API_URL;

function PurchaseHistory() {
  const { settings } = useSettings();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ totalQty: 0, totalValue: 0 });
  const [loading, setLoading] = useState(true);

  // Filters state
  const [supplier, setSupplier] = useState("");
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("");
  const [articleNumber, setArticleNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Dropdowns loaded from backend
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    types: [],
    suppliers: []
  });

  const fetchFilterOptions = () => {
    axios
      .get(`${API}/api/products/filters`)
      .then((res) => {
        if (res.data) {
          setFilterOptions({
            brands: res.data.brands || [],
            types: res.data.types || [],
            suppliers: res.data.suppliers || []
          });
        }
      })
      .catch((err) => console.error("Error loading filters:", err));
  };

  const fetchPurchaseHistory = () => {
    setLoading(true);
    axios
      .get(`${API}/api/purchases`, {
        params: {
          supplier: supplier || undefined,
          brand: brand || undefined,
          type: type || undefined,
          article_number: articleNumber.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined
        }
      })
      .then((res) => {
        if (res.data) {
          setRecords(res.data.records || []);
          setSummary(res.data.summary || { totalQty: 0, totalValue: 0 });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching purchases:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchPurchaseHistory();
  }, [supplier, brand, type, articleNumber, startDate, endDate]);

  // Real-time updates
  useEffect(() => {
    const handleUpdate = () => {
      fetchFilterOptions();
      fetchPurchaseHistory();
    };
    window.addEventListener("stock-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("stock-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [supplier, brand, type, articleNumber, startDate, endDate]);

  const handleResetFilters = () => {
    setSupplier("");
    setBrand("");
    setType("");
    setArticleNumber("");
    setStartDate("");
    setEndDate("");
  };

  const exportExcel = () => {
    if (records.length === 0) {
      alert("No purchase records to export.");
      return;
    }

    const headers = [
      "Purchase Date",
      "Reference No",
      "Supplier Name",
      "Article No",
      "Brand",
      "Product Type",
      "Size",
      "Color",
      "Quantity Purchased",
      "Purchase Price (INR)",
      "Total Purchase Value (INR)"
    ];

    const rows = records.map(r => {
      const d = new Date(r.purchase_date);
      return [
        `"${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}"`,
        `"${r.purchase_ref_no || ""}"`,
        `"${(r.supplier_name || "").replace(/"/g, '""')}"`,
        `"${r.article_number || ""}"`,
        `"${(r.brand || "").replace(/"/g, '""')}"`,
        `"${(r.type || "").replace(/"/g, '""')}"`,
        `"${r.size || ""}"`,
        `"${(r.color || "").replace(/"/g, '""')}"`,
        r.quantity,
        Number(r.purchase_price || 0).toFixed(2),
        Number(r.total_value || 0).toFixed(2)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Purchase_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (records.length === 0) {
      alert("No purchase records to export.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape" });
    const shopTitle = settings.shop_name || "My Slipper Shop";

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.text(shopTitle, 14, 15);

    doc.setFontSize(12);
    doc.text("Purchase History / Restock Audit Report", 14, 22);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Period: ${startDate || "Lifetime"} to ${endDate || "Present"}`, 14, 28);
    doc.text(`Generated Date: ${new Date().toLocaleString("en-IN")}`, 14, 33);
    
    let filterStr = "";
    if (supplier) filterStr += `Supplier: ${supplier} `;
    if (brand) filterStr += `Brand: ${brand} `;
    if (type) filterStr += `Type: ${type} `;
    if (articleNumber) filterStr += `Article: ${articleNumber}`;
    if (filterStr) {
      doc.text(`Active Filters: ${filterStr}`, 14, 38);
    }

    const startY = filterStr ? 44 : 39;

    const tableHeaders = [["Purchase Date", "Ref No", "Supplier Name", "Article No", "Brand", "Type", "Size / Color", "Qty", "Cost Price", "Total Value (₹)"]];
    const tableData = records.map(r => {
      const d = new Date(r.purchase_date);
      return [
        `${d.toLocaleDateString("en-IN")} ${d.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}`,
        r.purchase_ref_no,
        r.supplier_name,
        r.article_number,
        r.brand,
        r.type,
        `S-${r.size} / ${r.color}`,
        `${r.quantity} pairs`,
        `₹${Number(r.purchase_price || 0).toFixed(2)}`,
        `₹${Number(r.total_value || 0).toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY,
      head: tableHeaders,
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 8.5, cellPadding: 3 }
    });

    doc.save(`Purchase_History_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[36px] md:text-[44px] font-bold tracking-tight text-brand-text leading-tight">Purchase History</h1>
          <p className="text-[15px] sm:text-[18px] font-medium text-brand-subtext mt-1">Audit log of all slipper inventory restocks and stock transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportExcel}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </button>
          <button
            onClick={exportPDF}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-brand-danger hover:bg-red-100 transition-colors shadow-sm"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card rounded-2xl p-6 shadow-premium bg-white space-y-4">
        <div className="flex items-center gap-2 text-brand-accent mb-2">
          <ShoppingCart className="h-5 w-5" />
          <h3 className="font-bold text-[16px] uppercase tracking-wider">Restock Filters</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Supplier */}
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
          >
            <option value="">All Suppliers</option>
            {filterOptions.suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Brand */}
          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
          >
            <option value="">All Brands</option>
            {filterOptions.brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {/* Type */}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
          >
            <option value="">All Types</option>
            {filterOptions.types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Article Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtext" />
            <input
              type="text"
              value={articleNumber}
              onChange={(e) => setArticleNumber(e.target.value)}
              placeholder="Article No..."
              className="h-11 w-full rounded-xl border border-brand-border bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 uppercase"
            />
          </div>

          {/* Date range filters */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            title="From Date"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            title="To Date"
          />
        </div>
        <div className="flex justify-end pt-2 border-t border-slate-50">
          <button
            onClick={handleResetFilters}
            className="px-5 py-2.5 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Grid List */}
      <div className="glass-card rounded-2xl shadow-premium bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px] border-collapse">
            <thead>
              <tr className="border-b border-brand-border bg-slate-50 text-[14px] sm:text-[15px] font-bold uppercase tracking-wider text-brand-subtext">
                <th className="px-5 py-4">Purchase Date</th>
                <th className="px-5 py-4">Reference No</th>
                <th className="px-5 py-4">Supplier Name</th>
                <th className="px-5 py-4">Article No</th>
                <th className="px-5 py-4">Brand / Type</th>
                <th className="px-5 py-4 text-center">Size / Color</th>
                <th className="px-5 py-4 text-center">Qty Purchased</th>
                <th className="px-5 py-4 text-right">Purchase Price</th>
                <th className="px-5 py-4 text-right">Total Purchase Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
              {loading ? (
                <tr>
                  <td colSpan="9" className="text-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent mx-auto"></div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8 text-brand-subtext font-normal">
                    No purchase logs found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                records.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-4 text-xs font-semibold text-brand-subtext">
                      {new Date(r.purchase_date).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      })}
                    </td>
                    <td className="px-5 py-4 text-brand-accent font-bold uppercase">{r.purchase_ref_no}</td>
                    <td className="px-5 py-4 text-brand-text font-bold">{r.supplier_name}</td>
                    <td className="px-5 py-4 font-bold text-xs uppercase text-slate-700">{r.article_number}</td>
                    <td className="px-5 py-4 font-bold">{r.brand} {r.type}</td>
                    <td className="px-5 py-4 text-center text-xs">S-{r.size} / {r.color}</td>
                    <td className="px-5 py-4 text-slate-600 font-bold">{r.quantity} pairs</td>
                    <td className="px-5 py-4 text-right font-medium text-slate-500">₹{Number(r.purchase_price).toFixed(2)}</td>
                    <td className="px-5 py-4 text-right font-bold text-emerald-600">
                      ₹{Number(r.total_value).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default PurchaseHistory;
