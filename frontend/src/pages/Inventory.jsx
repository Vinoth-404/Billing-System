import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useSettings } from "../context/SettingsContext";
import ErrorBoundary from "../components/ErrorBoundary";
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
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [searchArtNo, setSearchArtNo] = useState("");
  
  // Edit Product Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    article_number: "",
    brand: "",
    type: "",
    size: "",
    color: "",
    purchase_price: "",
    selling_price: "",
    stock: "",
    supplier_name: ""
  });
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

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
  const [selectedSupplier, setSelectedSupplier] = useState("");

  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const [filteredProducts, setFilteredProducts] = useState([]);


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
    const threshold = settings?.stock_threshold || parseInt(localStorage.getItem("settings_stockThreshold"), 10) || 5;

    const matches = allProducts.filter((p) => {
      const matchBrand = selectedBrand === "" || p.brand === selectedBrand;
      const matchType = selectedType === "" || p.type === selectedType;
      const matchSize = selectedSize === "" || p.size.toString() === selectedSize;
      const matchColor = selectedColor === "" || p.color === selectedColor;
      const matchSupplier = selectedSupplier === "" || p.supplier_name === selectedSupplier;
      const query = searchArtNo.toLowerCase().trim();
      const matchSearch = query === "" || (
        (p.article_number && p.article_number.toString().toLowerCase().includes(query)) ||
        (p.serial_no && p.serial_no.toLowerCase().includes(query)) ||
        (p.brand && p.brand.toLowerCase().includes(query)) ||
        (p.type && p.type.toLowerCase().includes(query)) ||
        (p.size && p.size.toString().toLowerCase().includes(query)) ||
        (p.color && p.color.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query)) ||
        (p.supplier_name && p.supplier_name.toLowerCase().includes(query))
      );
      
      // Status matching
      let productStatus = "Available";
      if (p.stock === 0) {
        productStatus = "Out Of Stock";
      } else if (p.stock > 0 && p.stock < threshold) {
        productStatus = "Low Stock";
      }

      const matchStatus = selectedStatus === "" || productStatus === selectedStatus;

      return matchBrand && matchType && matchSize && matchColor && matchStatus && matchSearch && matchSupplier;
    });

    setFilteredProducts(matches);
  }, [selectedBrand, selectedType, selectedSize, selectedColor, selectedStatus, selectedSupplier, searchArtNo, allProducts, settings?.stock_threshold]);

  const handleResetFilters = () => {
    setSelectedBrand("");
    setSelectedType("");
    setSelectedSize("");
    setSelectedColor("");
    setSelectedStatus("");
    setSelectedSupplier("");
    setSearchArtNo("");
  };

  const handleAddNewClick = (category) => {
    navigate("/master-data");
  };

  const handleEditClick = (prod) => {
    if (!prod) return;
    setEditingProduct(prod);
    setEditForm({
      article_number: prod.article_number || "",
      brand: prod.brand || "",
      type: prod.type || "",
      size: prod.size !== undefined && prod.size !== null ? prod.size.toString() : "",
      color: prod.color || "",
      purchase_price: prod.purchase_price !== undefined && prod.purchase_price !== null ? prod.purchase_price : "",
      selling_price: prod.selling_price !== undefined && prod.selling_price !== null ? prod.selling_price : "",
      stock: prod.stock !== undefined && prod.stock !== null ? prod.stock : 0,
      supplier_name: prod.supplier_name || ""
    });
    setEditError("");
    setEditModalOpen(true);
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editForm.article_number.trim()) {
      setEditError("Article Number is required");
      return;
    }

    setEditSubmitting(true);
    setEditError("");

    axios
      .put(`${API}/api/products/${editingProduct.id}`, editForm)
      .then(() => {
        setEditModalOpen(false);
        setEditSubmitting(false);
        fetchProductsCatalog();
        window.dispatchEvent(new Event("stock-updated"));
      })
      .catch((err) => {
        setEditSubmitting(false);
        setEditError(err.response?.data?.error || "Failed to update product.");
      });
  };

  const handleDeleteClick = (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) {
      return;
    }

    axios
      .delete(`${API}/api/products/${id}`)
      .then(() => {
        fetchProductsCatalog();
        window.dispatchEvent(new Event("stock-updated"));
      })
      .catch((err) => {
        alert(err.response?.data?.error || "Failed to delete product.");
      });
  };


  const getStatusBadge = (stock) => {
    const threshold = settings?.stock_threshold || parseInt(localStorage.getItem("settings_stockThreshold"), 10) || 5;
    if (stock === 0) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1 text-[14px] font-bold uppercase text-brand-danger border border-red-100">
          <XCircle className="h-3.5 w-3.5" />
          Out Of Stock
        </span>
      );
    }
    if (stock > 0 && stock < threshold) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1 text-[14px] font-bold uppercase text-amber-600 border border-amber-100">
          <AlertTriangle className="h-3.5 w-3.5" />
          Low Stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-[14px] font-bold uppercase text-emerald-600 border border-emerald-100">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Available
      </span>
    );
  };

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aVal = a[sortConfig.key] || "";
    const bVal = b[sortConfig.key] || "";
    
    if (aVal < bVal) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aVal > bVal) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">Inventory Management</h1>
          <p className="text-[18px] font-medium text-brand-subtext mt-1">Audit serial codes, review cost prices, and track physical slipper stock levels</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          title="Refresh Inventory"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Filter Options */}
      <div className="glass-card rounded-2xl p-6 shadow-premium space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-6 w-6 text-brand-accent" />
            <h3 className="text-[24px] font-bold text-brand-text">Filter Inventory Stock</h3>
          </div>
          {(selectedBrand || selectedType || selectedSize || selectedColor || selectedStatus) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[15px] font-bold text-brand-accent hover:text-blue-600 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
          {/* Inventory Search Box */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Search Products</label>
            <div className="relative">
              <input
                type="text"
                value={searchArtNo}
                onChange={(e) => setSearchArtNo(e.target.value)}
                placeholder="Search by Art No, SKU..."
                className="h-12 w-full rounded-xl border border-brand-border bg-white pl-10 pr-3 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            </div>
          </div>

          {/* Brand */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Brand</label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Brands</option>
              {filterOptions.brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Product Type */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Product Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Types</option>
              {filterOptions.types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Size */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Size</label>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Sizes</option>
              {filterOptions.sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Color</label>
            <select
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Colors</option>
              {filterOptions.colors.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Supplier</label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Suppliers</option>
              {filterOptions.suppliers && filterOptions.suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Stock Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            >
              <option value="">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out Of Stock">Out Of Stock</option>
            </select>
          </div>
        </div>


      </div>

      {/* Inventory Stock Ledger Table */}
      <div className="glass-card rounded-2xl p-7 shadow-premium bg-white">
        <div className="mb-4 flex items-center gap-2">
          <Boxes className="h-6 w-6 text-brand-accent" />
          <h3 className="text-[24px] font-bold text-brand-text">Active Inventory Stock Ledger</h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-36 items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-primary" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-xl">
              <AlertTriangle className="h-8 w-8 text-brand-subtext mb-2 animate-bounce" />
              <span className="text-[15px] font-bold uppercase tracking-wider text-brand-text">No inventory slippers found.</span>
              <p className="text-[14px] text-brand-subtext mt-1 font-medium">Try updating or resetting your filters.</p>
            </div>
          ) : (
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                  <th className="px-5 py-3.5">Article No</th>
                  <th className="px-5 py-3.5">Brand</th>
                  <th className="px-5 py-3.5">Product</th>
                  <th className="px-5 py-3.5 text-center">Size</th>
                  <th className="px-5 py-3.5">Color</th>
                  <th className="px-5 py-3.5 cursor-pointer hover:text-brand-accent transition-colors" onClick={() => requestSort("supplier_name")}>
                    Supplier {sortConfig.key === "supplier_name" && (sortConfig.direction === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-5 py-3.5 text-right">Purchase Price</th>
                  <th className="px-5 py-3.5 text-right">Selling Price</th>
                  <th className="px-5 py-3.5 text-center">Stock</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                {sortedProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-brand-accent text-[15px]">{prod.article_number}</td>
                    <td className="px-5 py-3.5 text-[15px]">{prod.brand}</td>
                    <td className="px-5 py-3.5 text-[15px]">{prod.type}</td>
                    <td className="px-5 py-3.5 text-center text-[15px]">{prod.size}</td>
                    <td className="px-5 py-3.5 text-[15px]">{prod.color}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-[15px]">{prod.supplier_name || "-"}</td>
                    <td className="px-5 py-3.5 text-right text-[15px]">₹{Number(prod.purchase_price).toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-right text-[15px]">₹{Number(prod.selling_price).toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-center text-[15px]">{prod.stock} pairs</td>
                    <td className="px-5 py-3.5 text-center">
                      {getStatusBadge(prod.stock)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditClick(prod)}
                          className="px-3 py-1.5 rounded-lg border border-brand-border bg-white text-[14px] font-bold text-brand-accent hover:bg-brand-light transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(prod.id)}
                          className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-[14px] font-bold text-brand-danger hover:bg-red-50 transition-colors"
                        >
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
      </div>

      {/* Edit Product Modal */}
      {editModalOpen && (
        <ErrorBoundary onReset={() => setEditModalOpen(false)}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white rounded-2xl border border-brand-border shadow-premium overflow-hidden animate-slide-up">
              <div className="flex items-center justify-between border-b border-brand-border px-6 py-4 bg-slate-50/50">
                <h3 className="text-[20px] font-bold text-brand-text uppercase tracking-wider">
                  Edit Product Attributes
                </h3>
                <button 
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="text-brand-subtext hover:text-brand-text transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                {editError && (
                  <div className="rounded-xl p-3 text-[14px] font-bold border bg-red-50 text-brand-danger border-red-200 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-brand-danger" />
                    <div>{editError}</div>
                  </div>
                )}
                
                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">
                    Article Number <span className="text-brand-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.article_number}
                    onChange={(e) => setEditForm(prev => ({ ...prev, article_number: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Brand</label>
                    <input
                      type="text"
                      value={editForm.brand}
                      onChange={(e) => setEditForm(prev => ({ ...prev, brand: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Product Type</label>
                    <input
                      type="text"
                      value={editForm.type}
                      onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Size</label>
                    <input
                      type="text"
                      value={editForm.size}
                      onChange={(e) => setEditForm(prev => ({ ...prev, size: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Color</label>
                    <input
                      type="text"
                      value={editForm.color}
                      onChange={(e) => setEditForm(prev => ({ ...prev, color: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Cost (₹)</label>
                    <input
                      type="number"
                      value={editForm.purchase_price}
                      onChange={(e) => setEditForm(prev => ({ ...prev, purchase_price: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-2.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Price (₹)</label>
                    <input
                      type="number"
                      value={editForm.selling_price}
                      onChange={(e) => setEditForm(prev => ({ ...prev, selling_price: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-2.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Stock</label>
                    <input
                      type="number"
                      value={editForm.stock}
                      onChange={(e) => setEditForm(prev => ({ ...prev, stock: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-brand-border bg-white px-2.5 text-[16px] font-medium outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext">Supplier Name <span className="text-brand-danger">*</span></label>
                    <button
                      type="button"
                      onClick={() => handleAddNewClick("suppliers")}
                      className="text-[14px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase"
                    >
                      + Add Supplier
                    </button>
                  </div>
                  <select
                    value={editForm.supplier_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, supplier_name: e.target.value }))}
                    className="h-11 w-full rounded-xl border border-brand-border bg-white px-3.5 text-[16px] font-medium outline-none focus:border-brand-primary/60"
                    required
                  >
                    <option value="">Select Supplier</option>
                    {filterOptions.suppliers && filterOptions.suppliers.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-brand-border bg-white text-[15px] font-bold text-brand-subtext hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSubmitting}
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-brand-accent text-[15px] font-bold text-white shadow-md hover:bg-blue-600 transition-all disabled:opacity-55"
                  >
                    {editSubmitting && <RefreshCw className="h-4 w-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}

export default Inventory;
