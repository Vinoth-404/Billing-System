import { useState, useEffect } from "react";
import axios from "axios";
import { PackageOpen, Sparkles, RefreshCw, Trash2 } from "lucide-react";
const API = import.meta.env.VITE_API_URL;

function AddStock() {
  const initialFormState = {
    serial_no: "",
    article_number: "",
    supplier_id: "",
    supplier_name: "",
    supplier_code: "",
    secret_code: "",
    brand: "",
    type: "",
    size: "",
    color: "",
    purchase_price: "",
    selling_price: "",
    discount_percent: "0",
    stock: "",
    purchase_ref_no: "",
  };

  const [formData, setFormData] = useState(initialFormState);
  const [isExisting, setIsExisting] = useState(false);
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [alert, setAlert] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  // Dynamic dropdown lists loaded from Master Data DB
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    types: [],
    sizes: [],
    colors: [],
    suppliers: []
  });

  // Fetch unique filter values from Master Data DB API
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
              const matchedSupplierName = res.data.supplier_name || "";
              const supObj = filterOptions.suppliers?.find(
                (s) => (typeof s === "object" ? (s.name || s.supplier_name) : s) === matchedSupplierName || (typeof s === "object" && s.id === res.data.supplier_id)
              );
              const supCode = res.data.supplier_code || (supObj ? (supObj.code || supObj.supplier_code) : "");
              const supId = res.data.supplier_id || (supObj ? supObj.id : "");
              const secCode = res.data.secret_code || "";

              setFormData((prev) => ({
                ...prev,
                serial_no: res.data.serial_no,
                purchase_price: res.data.purchase_price,
                selling_price: res.data.selling_price,
                discount_percent: res.data.discount_percent || "0",
                supplier_id: supId,
                supplier_name: matchedSupplierName || (supObj ? (supObj.name || supObj.supplier_name) : prev.supplier_name),
                supplier_code: supCode || prev.supplier_code,
                secret_code: prev.secret_code || secCode,
                article_number: res.data.article_number || prev.article_number || "",
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

  const handleSupplierChange = (e) => {
    const selectedName = e.target.value;
    if (!selectedName) {
      setFormData((prev) => ({
        ...prev,
        supplier_name: "",
        supplier_id: "",
        supplier_code: ""
      }));
      return;
    }

    const supplierObj = filterOptions.suppliers?.find(
      (s) => (typeof s === "object" ? (s.name || s.supplier_name) : s) === selectedName
    );

    if (supplierObj && typeof supplierObj === "object") {
      const code = supplierObj.code || supplierObj.supplier_code || "";
      const id = supplierObj.id || "";
      setFormData((prev) => ({
        ...prev,
        supplier_name: selectedName,
        supplier_id: id,
        supplier_code: code
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        supplier_name: selectedName,
        supplier_id: "",
        supplier_code: ""
      }));
    }
  };

  const handleClear = () => {
    setFormData(initialFormState);
    setIsExisting(false);
    setAlert({ type: "", message: "" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      article_number: formData.article_number ? formData.article_number.trim().toUpperCase() : "",
      secret_code: formData.secret_code ? formData.secret_code.trim().toUpperCase() : "",
      supplier_id: formData.supplier_id || null,
      supplier_name: formData.supplier_name ? formData.supplier_name.trim() : "",
      supplier_code: formData.supplier_code ? formData.supplier_code.trim() : ""
    };

    // Validations
    if (!payload.article_number || !payload.secret_code || !payload.supplier_name || !payload.brand || !payload.type || !payload.size || !payload.color || !payload.purchase_price || !payload.selling_price || !payload.stock) {
      setAlert({ type: "danger", message: "Please fill in all required fields (including Article Number, Secret Code, and Supplier Name)." });
      return;
    }

    if (parseFloat(payload.purchase_price) < 0 || parseFloat(payload.selling_price) < 0 || parseInt(payload.stock) <= 0) {
      setAlert({ type: "danger", message: "Price and quantity values must be positive numbers." });
      return;
    }

    setSubmitting(true);
    setAlert({ type: "", message: "" });

    axios
      .post(`${API}/api/products`, payload)
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

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div>
        <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">Add Slipper Stock</h1>
        <p className="text-[18px] font-medium text-brand-subtext mt-1">Register new slipper product lines or top up existing quantities</p>
      </div>

      {/* Main Form Content */}
      <div className="max-w-4xl">
        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-7 shadow-premium space-y-6 bg-white border border-slate-100">
          
          {/* Status alerts */}
          {alert.message && (
            <div className={`rounded-xl p-4 text-[15px] font-bold border ${
              alert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {alert.message}
            </div>
          )}

          {/* Row 1: Article Number & Secret Code */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Article Number <span className="text-brand-danger">*</span>
              </label>
              <input
                type="text"
                name="article_number"
                value={formData.article_number}
                onChange={handleInputChange}
                placeholder="e.g. 5-3841"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-bold uppercase outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Secret Code <span className="text-brand-danger">*</span>
              </label>
              <input
                type="text"
                name="secret_code"
                value={formData.secret_code}
                onChange={handleInputChange}
                placeholder="e.g. IKP (manually entered)"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-mono font-bold uppercase outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
              <p className="text-[12px] font-medium text-brand-subtext mt-1">
                Product secret code printed on barcode labels (separate from supplier code).
              </p>
            </div>
          </div>

          {/* Row 2: Supplier Selection (Dropdown + Auto-populated Read-Only Code) */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Supplier Name <span className="text-brand-danger">*</span>
              </label>
              <select
                name="supplier_name"
                value={formData.supplier_name}
                onChange={handleSupplierChange}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Supplier</option>
                {filterOptions.suppliers && filterOptions.suppliers.map((s) => {
                  const name = typeof s === "object" ? (s.name || s.supplier_name) : s;
                  const code = typeof s === "object" ? (s.code || s.supplier_code) : "";
                  return (
                    <option key={name} value={name}>
                      {name} {code ? `(${code})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Supplier Code <span className="text-[12px] font-normal text-slate-500 normal-case">(Read-Only)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="supplier_code"
                  value={formData.supplier_code || ""}
                  readOnly
                  placeholder="Auto-populated from database"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 text-[16px] font-mono font-bold text-slate-800 outline-none cursor-not-allowed select-none"
                />
                {formData.supplier_code && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-emerald-100 px-2.5 py-1 text-[12px] font-bold uppercase tracking-wider text-emerald-800">
                    Linked
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Product Specifications */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Brand <span className="text-brand-danger">*</span>
              </label>
              <select
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Brand</option>
                {filterOptions.brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Product Type <span className="text-brand-danger">*</span>
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Type</option>
                {filterOptions.types.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Variant Specifications */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Size (UK/US) <span className="text-brand-danger">*</span>
              </label>
              <select
                name="size"
                value={formData.size}
                onChange={handleInputChange}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              >
                <option value="">Select Size</option>
                {filterOptions.sizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Color <span className="text-brand-danger">*</span>
              </label>
              <select
                name="color"
                value={formData.color}
                onChange={handleInputChange}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
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
            <div className="flex items-center justify-center gap-2 text-[15px] font-medium text-brand-primary py-2.5 bg-slate-50 rounded-xl border border-dashed border-brand-border animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin text-brand-primary" />
              <span>Checking product database...</span>
            </div>
          )}

          {isExisting && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] font-bold text-brand-warning flex items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 text-brand-warning animate-pulse" />
              <div>Existing Product Combination Found! Stock will be topped up. SKU: <span className="underline">{formData.serial_no}</span></div>
            </div>
          )}

          {/* Row 5: Financial Details */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Purchase Price (₹) <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleInputChange}
                placeholder="Cost price"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Selling Price (₹) <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="selling_price"
                value={formData.selling_price}
                onChange={handleInputChange}
                placeholder="Retail price"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>
          </div>

          {/* Row 6: Inventory Quantity & Purchase Reference */}
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                {isExisting ? "Qty to ADD (Top up)" : "Stock Quantity"} <span className="text-brand-danger">*</span>
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder={isExisting ? "e.g. 15 (adds to catalog)" : "Initial stock"}
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Purchase Reference Number
              </label>
              <input
                type="text"
                name="purchase_ref_no"
                value={formData.purchase_ref_no}
                onChange={handleInputChange}
                placeholder="Auto-generated if left blank"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-bold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 uppercase"
              />
            </div>
          </div>

          {/* Actions Row */}
          <div className="flex items-center justify-end gap-4 border-t border-brand-border pt-6">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-6 py-3.5 text-[15px] font-bold text-brand-subtext transition-all hover:bg-slate-50 hover:text-brand-text"
            >
              <Trash2 className="h-5 w-5" />
              Clear Form
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-brand-accent px-7 py-3.5 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 hover:shadow-lg focus:ring-2 focus:ring-brand-accent/20 disabled:bg-brand-primary/50"
            >
              {submitting ? (
                <RefreshCw className="h-5 w-5 animate-spin" />
              ) : (
                <PackageOpen className="h-5 w-5" />
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