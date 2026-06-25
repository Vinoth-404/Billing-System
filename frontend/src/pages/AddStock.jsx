import { useState, useEffect } from "react";
import axios from "axios";
import { PackageOpen, Sparkles, RefreshCw, Trash2, ArrowRight, X, AlertTriangle } from "lucide-react";
const API = import.meta.env.VITE_API_URL;
function AddStock() {
  const initialFormState = {
    serial_no: "",
    brand: "",
    type: "",
    size: "",
    color: "",
    purchase_price: "",
    selling_price: "",
    discount_percent: "0",
    stock: "",
    supplier_name: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const [isExisting, setIsExisting] = useState(false);
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [alert, setAlert] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  // Dynamic dropdown lists loaded from DB
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    types: [],
    sizes: [],
    colors: []
  });

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
  const fetchFilterOptions = (selectNewCategory = null, selectNewValue = null) => {
    axios
      .get(`${API}/api/products/filters`)
      .then((res) => {
        if (res.data) {
          setFilterOptions(res.data);
          
          if (selectNewCategory && selectNewValue) {
            setFormData(prev => ({
              ...prev,
              [selectNewCategory]: selectNewValue
            }));
          }
        }
      })
      .catch((err) => console.error("Error loading filter options:", err));
  };

  // Auto-fetch if Brand + Type + Size + Color matches an existing product in our database
  useEffect(() => {
    const { brand, type, size, color } = formData;
    if (brand && type && size && color) {
      const delayDebounce = setTimeout(() => {
        setCheckingSerial(true);
        axios
          .get(`${API}/api/products/search/attributes`, {
            params: { brand, type, size, color }
          })
          .then((res) => {
            if (res.data) {
              setFormData((prev) => ({
                ...prev,
                serial_no: res.data.serial_no,
                purchase_price: res.data.purchase_price,
                selling_price: res.data.selling_price,
                discount_percent: res.data.discount_percent || "0",
                supplier_name: res.data.supplier_name || "",
                stock: ""
              }));
              setIsExisting(true);
            }
            setCheckingSerial(false);
          })
          .catch(() => {
            setIsExisting(false);
            setCheckingSerial(false);
            setFormData((prev) => ({
              ...prev,
              serial_no: ""
            }));
          });
      }, 300);

      return () => clearTimeout(delayDebounce);
    } else {
      setIsExisting(false);
      setFormData((prev) => ({
        ...prev,
        serial_no: ""
      }));
    }
  }, [formData.brand, formData.type, formData.size, formData.color]);

  // Load filter options on mount & subscribe to updates
  useEffect(() => {
    fetchFilterOptions();

    const handleStockUpdate = () => {
      fetchFilterOptions();
    };

    window.addEventListener("stock-updated", handleStockUpdate);
    window.addEventListener("storage", handleStockUpdate);

    return () => {
      window.removeEventListener("stock-updated", handleStockUpdate);
      window.removeEventListener("storage", handleStockUpdate);
    };
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleClear = () => {
    setFormData(initialFormState);
    setIsExisting(false);
    setAlert({ type: "", message: "" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validations
    if (!formData.brand || !formData.type || !formData.size || !formData.color || !formData.purchase_price || !formData.selling_price || !formData.stock) {
      setAlert({ type: "danger", message: "Please fill in all required fields." });
      return;
    }

    if (parseFloat(formData.purchase_price) < 0 || parseFloat(formData.selling_price) < 0 || parseInt(formData.stock) <= 0) {
      setAlert({ type: "danger", message: "Price and quantity values must be positive numbers." });
      return;
    }

    setSubmitting(true);
    setAlert({ type: "", message: "" });

    axios
      .post(`${API}/api/products`, formData)
      .then((res) => {
        const actionText = isExisting ? "topped up" : "added";
        const purchaseVal = parseFloat(formData.purchase_price) || 0;
        const sellingVal = parseFloat(formData.selling_price) || 0;
        const profitVal = sellingVal - purchaseVal;

        setAlert({
          type: "success",
          message: `Stock successfully ${actionText}! Product "${formData.brand} ${formData.type}" updated in catalog. (Profit Per Pair: ₹${profitVal.toFixed(2)})`
        });
        
        window.dispatchEvent(new Event("stock-updated"));

        // Reset form
        setTimeout(() => {
          handleClear();
        }, 1500);
      })
      .catch((err) => {
        setAlert({
          type: "danger",
          message: err.response?.data?.error || "Failed to save product stock. Please try again."
        });
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  // Open inline modal for adding Brand/Type/Size/Color
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

  // Submit inline modal form
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
        
        let fieldName = "brand";
        if (inlineModal.category === "types") fieldName = "type";
        if (inlineModal.category === "sizes") fieldName = "size";
        if (inlineModal.category === "colors") fieldName = "color";

        fetchFilterOptions(fieldName, res.data.name);

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

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">Add Slipper Stock</h1>
        <p className="text-sm font-semibold text-brand-subtext mt-1">Register new slipper product lines or top up existing quantities</p>
      </div>

      {/* Main Form Content */}
      <div className="max-w-4xl">
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 shadow-premium space-y-6 bg-white border border-slate-100">
          
          {/* Status alerts */}
          {alert.message && (
            <div className={`rounded-xl p-4 text-xs font-bold border ${
              alert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {alert.message}
            </div>
          )}

          {/* Product Specifications Row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext">
                  Brand <span className="text-brand-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddNewClick("brands")}
                  className="text-[10px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase tracking-wider"
                >
                  + Add New Brand
                </button>
              </div>
              <select
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Brand</option>
                {filterOptions.brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext">
                  Product Type <span className="text-brand-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddNewClick("types")}
                  className="text-[10px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase tracking-wider"
                >
                  + Add New Type
                </button>
              </div>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Type</option>
                {filterOptions.types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Variant Specifications Row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext">
                  Size (UK/US) <span className="text-brand-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddNewClick("sizes")}
                  className="text-[10px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase tracking-wider"
                >
                  + Add New Size
                </button>
              </div>
              <select
                name="size"
                value={formData.size}
                onChange={handleInputChange}
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Size</option>
                {filterOptions.sizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext">
                  Color <span className="text-brand-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleAddNewClick("colors")}
                  className="text-[10px] font-bold text-brand-accent hover:text-blue-600 transition-colors uppercase tracking-wider"
                >
                  + Add New Color
                </button>
              </div>
              <select
                name="color"
                value={formData.color}
                onChange={handleInputChange}
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Color</option>
                {filterOptions.colors.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {checkingSerial && (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-brand-primary py-2 bg-slate-50 rounded-xl border border-dashed border-brand-border animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-primary" />
              <span>Checking product database...</span>
            </div>
          )}

          {isExisting && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-brand-warning flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-warning animate-pulse" />
              <div>Existing Product Combination Found! Stock will be topped up. SKU: <span className="underline">{formData.serial_no}</span></div>
            </div>
          )}

          {/* Financial Details Row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Purchase Price (₹) <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleInputChange}
                placeholder="Cost price"
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Selling Price (₹) <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="selling_price"
                value={formData.selling_price}
                onChange={handleInputChange}
                placeholder="Retail price"
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>
          </div>

          {/* Inventory & Logistics Row */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                {isExisting ? "Qty to ADD (Top up)" : "Stock Quantity"} <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder={isExisting ? "e.g. 15 (adds to catalog)" : "Initial stock"}
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Supplier Name
              </label>
              <input
                type="text"
                name="supplier_name"
                value={formData.supplier_name}
                onChange={handleInputChange}
                placeholder="Wholesale vendor name"
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
              />
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

          {/* Actions Row */}
          <div className="flex items-center justify-end gap-4 border-t border-brand-border pt-6">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-5 py-3 text-xs font-bold text-brand-subtext transition-all hover:bg-slate-50 hover:text-brand-text"
            >
              <Trash2 className="h-4 w-4" />
              Clear Form
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-xs font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 hover:shadow-lg focus:ring-2 focus:ring-brand-accent/20 disabled:bg-brand-primary/50"
            >
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <PackageOpen className="h-4 w-4" />
              )}
              {isExisting ? "Top Up Stock" : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddStock;