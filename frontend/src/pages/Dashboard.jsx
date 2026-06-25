import { useEffect, useState } from "react";
import axios from "axios";
const API = import.meta.env.VITE_API_URL;
import { 
  Package, 
  Layers, 
  AlertTriangle, 
  AlertOctagon,
  Filter,
  RefreshCw,
  SearchCheck,
  CheckCircle2,
  XCircle
} from "lucide-react";

function Dashboard() {
  const [loading, setLoading] = useState(true);
  
  // Dashboard statistics state (KPIs only)
  const [stats, setStats] = useState({
    kpis: {
      totalProducts: 0,
      availableStock: 0,
      lowStockCount: 0,
      outOfStockCount: 0
    }
  });

  // Complete products catalog
  const [allProducts, setAllProducts] = useState([]);

  // Dynamic filter lists from DISTINCT DB queries
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    types: [],
    sizes: [],
    colors: []
  });

  // Selected filter states (tied to selects)
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");



  const [filteredProducts, setFilteredProducts] = useState([]);

  // Fetch dashboard stats
  const fetchDashboardData = () => {
    const threshold = localStorage.getItem("settings_stockThreshold") || 5;
    axios
      .get(`${API}/api/dashboard?threshold=${threshold}`)
      .then((res) => {
        if (res.data) {
          setStats(res.data);
        }
      })
      .catch((err) => console.error("Error loading dashboard stats:", err));
  };

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

  // Fetch all products for filtered search catalog
  const fetchProductsCatalog = () => {
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

  const handleRefreshAll = () => {
    fetchDashboardData();
    fetchFilterOptions();
    fetchProductsCatalog();
  };

  useEffect(() => {
    handleRefreshAll();
    
    const handleStockUpdate = () => {
      handleRefreshAll();
    };

    window.addEventListener("stock-updated", handleStockUpdate);
    window.addEventListener("storage", handleStockUpdate);

    // Poll stats and filter options every 8 seconds for real-time inventory updates
    const interval = setInterval(handleRefreshAll, 8000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("stock-updated", handleStockUpdate);
      window.removeEventListener("storage", handleStockUpdate);
    };
  }, []);

  // Filter products catalog based on selected filters
  useEffect(() => {
    const matches = allProducts.filter((p) => {
      const matchBrand = selectedBrand === "" || p.brand === selectedBrand;
      const matchType = selectedType === "" || p.type === selectedType;
      const matchSize = selectedSize === "" || p.size.toString() === selectedSize;
      const matchColor = selectedColor === "" || p.color === selectedColor;
      return matchBrand && matchType && matchSize && matchColor;
    });

    setFilteredProducts(matches);
  }, [selectedBrand, selectedType, selectedSize, selectedColor, allProducts]);

  // Actions
  const handleResetFilters = () => {
    setSelectedBrand("");
    setSelectedType("");
    setSelectedSize("");
    setSelectedColor("");
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-primary border-t-transparent"></div>
      </div>
    );
  }

  // KPI cards configurations (Only 4 cards retained)
  const kpiCards = [
    {
      title: "Product Varieties",
      value: stats.kpis.totalProducts,
      sub: "Total unique product lines / SKUs",
      icon: Package,
      color: "text-brand-accent bg-blue-50 border-blue-100"
    },
    {
      title: "Total Pairs In Stock",
      value: `${stats.kpis.availableStock} pcs`,
      sub: "Active physical pairs in shop",
      icon: Layers,
      color: "text-brand-accent bg-sky-50 border-sky-100"
    },
    {
      title: "Low Stock Products Count",
      value: stats.kpis.lowStockCount,
      sub: `Items requiring restock (stock < ${localStorage.getItem("settings_stockThreshold") || 5})`,
      icon: AlertTriangle,
      color: stats.kpis.lowStockCount > 0 ? "text-amber-600 bg-amber-50 border-amber-100 animate-pulse-subtle" : "text-slate-500 bg-slate-50 border-slate-100"
    },
    {
      title: "Out Of Stock Products Count",
      value: stats.kpis.outOfStockCount,
      sub: "Items completely sold out (stock = 0)",
      icon: AlertOctagon,
      color: stats.kpis.outOfStockCount > 0 ? "text-brand-danger bg-red-50 border-red-100" : "text-slate-500 bg-slate-50 border-slate-100"
    }
  ];

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header welcome banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">Inventory Overview</h1>
          <p className="text-sm font-semibold text-brand-subtext mt-1">Real-time slipper stock levels and catalog tracking</p>
        </div>
        <button
          onClick={handleRefreshAll}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          title="Refresh Inventory"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* 4 KPI Stats Cards Grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="glass-card glass-card-hover rounded-2xl p-5 shadow-premium">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-subtext">{card.title}</p>
                  <h3 className="mt-2 text-xl font-extrabold text-brand-text">{card.value}</h3>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${card.color}`}>
                  <Icon className="h-5.5 w-5.5" />
                </div>
              </div>
              <p className="mt-3 text-[10px] font-semibold text-brand-subtext">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Dynamic Dropdown Slipper Filters */}
      <div className="glass-card rounded-2xl p-6 shadow-premium bg-gradient-to-r from-white to-brand-light/20 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-brand-accent" />
          <h2 className="text-sm font-extrabold text-brand-text">Search Availability Filters</h2>
        </div>
        {(selectedBrand || selectedType || selectedSize || selectedColor) && (
          <button
            onClick={handleResetFilters}
            className="text-xs font-bold text-brand-accent hover:text-blue-600 transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>

        {/* 4-Dropdown Selectors Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Brand</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Brands</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Product Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Size */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Size</label>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Sizes</option>
              {filterOptions.sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Color</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Colors</option>
              {filterOptions.colors.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>


        {/* Filter Results Table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-brand-border bg-white shadow-sm">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50/10">
              <XCircle className="h-8 w-8 text-brand-danger mb-2" />
              <span className="text-xs font-bold uppercase tracking-wider text-brand-danger">No matching products found.</span>
              <p className="text-[10px] text-brand-subtext mt-1 font-semibold">Try updating or resetting your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-brand-border bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext sticky top-0 z-10">
                    <th className="px-4 py-3">Serial Number</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-center">Size</th>
                    <th className="px-4 py-3">Color</th>
                    <th className="px-4 py-3 text-right">Selling Price</th>
                    <th className="px-4 py-3 text-center">Available Stock</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                  {filteredProducts.map((prod) => (
                    <tr key={prod.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-brand-accent">{prod.serial_no}</td>
                      <td className="px-4 py-3">{prod.brand}</td>
                      <td className="px-4 py-3">{prod.type}</td>
                      <td className="px-4 py-3 text-center">{prod.size}</td>
                      <td className="px-4 py-3">{prod.color}</td>
                      <td className="px-4 py-3 text-right">₹{Number(prod.selling_price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">{prod.stock} pairs</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-lg px-2.5 py-0.5 text-[9px] font-extrabold uppercase ${
                          prod.stock > 0 
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                            : "bg-red-50 text-brand-danger border border-red-100"
                        }`}>
                          {prod.stock > 0 ? "✓ Available" : "✗ Out Of Stock"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;