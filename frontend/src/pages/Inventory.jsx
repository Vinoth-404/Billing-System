import { useState, useEffect } from "react";
import axios from "axios";
const API = import.meta.env.VITE_API_URL;
import { 
  Filter, 
  RefreshCw, 
  Boxes,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X
} from "lucide-react";

function Inventory() {
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  
  // Dynamic filter options from DISTINCT DB API
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    types: [],
    sizes: [],
    colors: []
  });

  // Selected filter states (tied to selectors)
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [filteredProducts, setFilteredProducts] = useState([]);

  // Inline Master Data Creation Modal State
  const [inlineModal, setInlineModal] = useState({
    isOpen: false,
    category: "", // "brands", "types", "sizes", "colors"
    label: "",
    value: "",
    error: "",
    submitting: false
  });

  // Fetch unique filter values from DISTINCT DB API
  const fetchFilterOptions = () => {
    axios
      .get(`${API}/api/products/filters`)
      .then((res) => {
        if (res.data) {
          setFilterOptions(res.data);
        }
      })
      .catch((err) => console.error("Error loading filter options:", err));
  };

  // Fetch all products
  const fetchProductsCatalog = () => {
    setLoading(true);
    axios
      .get(`${API}/api/products`)
      .then((res) => {
        if (res.data) {
          setAllProducts(res.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading product catalog:", err);
        setLoading(false);
      });
  };

  const handleRefresh = () => {
    fetchFilterOptions();
    fetchProductsCatalog();
  };

  // Subscribe to real-time events
  useEffect(() => {
    handleRefresh();

    const handleStockUpdate = () => {
      fetchProductsCatalog();
      fetchFilterOptions();
    };

    window.addEventListener("stock-updated", handleStockUpdate);
    window.addEventListener("storage", handleStockUpdate);

    return () => {
      window.removeEventListener("stock-updated", handleStockUpdate);
      window.removeEventListener("storage", handleStockUpdate);
    };
  }, []);

  // Filter products catalog locally based on selected filters
  useEffect(() => {
    const threshold = parseInt(localStorage.getItem("settings_stockThreshold")) || 5;

    const matches = allProducts.filter((p) => {
      const matchBrand = selectedBrand === "" || p.brand === selectedBrand;
      const matchType = selectedType === "" || p.type === selectedType;
      const matchSize = selectedSize === "" || p.size.toString() === selectedSize;
      const matchColor = selectedColor === "" || p.color === selectedColor;
      
      // Status matching
      let productStatus = "Available";
      if (p.stock === 0) {
        productStatus = "Out Of Stock";
      } else if (p.stock > 0 && p.stock < threshold) {
        productStatus = "Low Stock";
      }

      const matchStatus = selectedStatus === "" || productStatus === selectedStatus;

      return matchBrand && matchType && matchSize && matchColor && matchStatus;
    });

    setFilteredProducts(matches);
  }, [selectedBrand, selectedType, selectedSize, selectedColor, selectedStatus, allProducts]);

  const handleResetFilters = () => {
    setSelectedBrand("");
    setSelectedType("");
    setSelectedSize("");
    setSelectedColor("");
    setSelectedStatus("");
  };

  const handleAddNewClick = (category) => {
    let label = "Brand";
    if (category === "types") label = "Product Type";
    if (category === "sizes") label = "Size";
    if (category === "colors") label = "Color";

    setInlineModal({
      isOpen: true,
      category,
      label,
      value: "",
      error: "",
      submitting: false
    });
  };

  const handleInlineSubmit = (e) => {
    e.preventDefault();
    if (!inlineModal.value.trim()) {
      setInlineModal(prev => ({ ...prev, error: "Value cannot be empty" }));
      return;
    }

    setInlineModal(prev => ({ ...prev, submitting: true, error: "" }));

    axios
      .post(`${API}/api/master/${inlineModal.category}`, { name: inlineModal.value.trim() })
      .then((res) => {
        window.dispatchEvent(new Event("stock-updated"));
        
        if (inlineModal.category === "types") {
          setSelectedType(res.data.name);
        } else if (inlineModal.category === "sizes") {
          setSelectedSize(res.data.name);
        } else if (inlineModal.category === "colors") {
          setSelectedColor(res.data.name);
        } else {
          setSelectedBrand(res.data.name);
        }

        setInlineModal({
          isOpen: false,
          category: "",
          label: "",
          value: "",
          error: "",
          submitting: false
        });
      })
      .catch((err) => {
        setInlineModal(prev => ({
          ...prev,
          submitting: false,
          error: err.response?.data?.error || "Failed to add new item."
        }));
      });
  };

  const getStatusBadge = (stock) => {
    const threshold = parseInt(localStorage.getItem("settings_stockThreshold")) || 5;
    if (stock === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-brand-danger border border-red-100">
          <XCircle className="h-3 w-3" />
          Out Of Stock
        </span>
      );
    }
    if (stock > 0 && stock < threshold) {
      return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-600 border border-amber-100">
          <AlertTriangle className="h-3 w-3" />
          Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-emerald-600 border border-emerald-100">
        <CheckCircle2 className="h-3 w-3" />
        Available
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">Inventory Management</h1>
          <p className="text-sm font-semibold text-brand-subtext mt-1">Audit serial codes, review cost prices, and track physical slipper stock levels</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          title="Refresh Inventory"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Filter Options */}
      <div className="glass-card rounded-2xl p-5 shadow-premium space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-brand-accent" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-brand-subtext">Filter Inventory Stock</h3>
          </div>
          {(selectedBrand || selectedType || selectedSize || selectedColor || selectedStatus) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-brand-accent hover:text-blue-600 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Brand</label>
              <button
                type="button"
                onClick={() => handleAddNewClick("brands")}
                className="text-[9px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase"
              >
                + Add Brand
              </button>
            </div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Brands</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Product Type */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Product Type</label>
              <button
                type="button"
                onClick={() => handleAddNewClick("types")}
                className="text-[9px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase"
              >
                + Add Type
              </button>
            </div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Size */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Size</label>
              <button
                type="button"
                onClick={() => handleAddNewClick("sizes")}
                className="text-[9px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase"
              >
                + Add Size
              </button>
            </div>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Sizes</option>
              {filterOptions.sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Color</label>
              <button
                type="button"
                onClick={() => handleAddNewClick("colors")}
                className="text-[9px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase"
              >
                + Add Color
              </button>
            </div>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Colors</option>
              {filterOptions.colors.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2.5">Stock Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out Of Stock">Out Of Stock</option>
            </select>
          </div>
        </div>

        {/* Inline Modal Component inside Form */}
        {inlineModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm bg-white rounded-2xl border border-brand-border shadow-premium overflow-hidden animate-slide-up">
              <div className="flex items-center justify-between border-b border-brand-border px-5 py-4 bg-slate-50/50">
                <h3 className="text-xs font-extrabold text-brand-text uppercase tracking-wider">
                  Create New {inlineModal.label}
                </h3>
                <button 
                  type="button"
                  onClick={() => setInlineModal(prev => ({ ...prev, isOpen: false }))}
                  className="text-brand-subtext hover:text-brand-text transition-colors"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {inlineModal.error && (
                  <div className="rounded-xl p-3 text-xs font-bold border bg-red-50 text-brand-danger border-red-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-brand-danger" />
                    <div>{inlineModal.error}</div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    {inlineModal.label} Name <span className="text-brand-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={inlineModal.value}
                    onChange={(e) => setInlineModal(prev => ({ ...prev, value: e.target.value }))}
                    placeholder={`Enter new ${inlineModal.label.toLowerCase()}...`}
                    className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4">
                  <button
                    type="button"
                    onClick={() => setInlineModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2.5 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInlineSubmit}
                    disabled={inlineModal.submitting}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all disabled:opacity-55"
                  >
                    {inlineModal.submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Stock Ledger Table */}
      <div className="glass-card rounded-2xl p-6 shadow-premium bg-white">
        <div className="mb-4 flex items-center gap-2">
          <Boxes className="h-5 w-5 text-brand-accent" />
          <h3 className="text-sm font-extrabold text-brand-text">Active Inventory Stock Ledger</h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-36 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
              <span className="text-xs font-bold uppercase tracking-wider text-brand-text">No inventory slippers found.</span>
              <p className="text-[10px] text-brand-subtext mt-1 font-semibold">Try updating or resetting your filters.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-3">Serial Number</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Product Type</th>
                  <th className="px-4 py-3 text-center">Size</th>
                  <th className="px-4 py-3">Color</th>
                  <th className="px-4 py-3 text-right">Purchase Price</th>
                  <th className="px-4 py-3 text-right">Selling Price</th>
                  <th className="px-4 py-3 text-center">Current Stock</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-brand-accent">{prod.serial_no}</td>
                    <td className="px-4 py-3.5">{prod.brand}</td>
                    <td className="px-4 py-3.5">{prod.type}</td>
                    <td className="px-4 py-3.5 text-center">{prod.size}</td>
                    <td className="px-4 py-3.5">{prod.color}</td>
                    <td className="px-4 py-3.5 text-right">₹{Number(prod.purchase_price).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right">₹{Number(prod.selling_price).toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-center">{prod.stock} pairs</td>
                    <td className="px-4 py-3.5 text-center">
                      {getStatusBadge(prod.stock)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default Inventory;
