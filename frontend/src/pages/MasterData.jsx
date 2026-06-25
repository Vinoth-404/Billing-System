import { useState, useEffect } from "react";
import axios from "axios";
const API = import.meta.env.VITE_API_URL;
import { 
  Plus, 
  RefreshCw, 
  AlertTriangle,
  X,
  CheckCircle2,
  Search
} from "lucide-react";

function MasterData() {
  const [brands, setBrands] = useState([]);
  const [types, setTypes] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);

  // Individual Search Queries
  const [searchBrands, setSearchBrands] = useState("");
  const [searchTypes, setSearchTypes] = useState("");
  const [searchSizes, setSearchSizes] = useState("");
  const [searchColors, setSearchColors] = useState("");
  const [searchExpenseCategories, setSearchExpenseCategories] = useState("");

  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ type: "", message: "" });

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // "add" or "edit"
  const [modalCategory, setModalCategory] = useState(""); // "brands", "types", "sizes", "colors"
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemNameInput, setItemNameInput] = useState("");
  const [modalError, setModalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAllData = () => {
    setLoading(true);
    setAlert({ type: "", message: "" });
    Promise.all([
      axios.get(`${API}/api/master/brands`),
      axios.get(`${API}/api/master/types`),
      axios.get(`${API}/api/master/sizes`),
      axios.get(`${API}/api/master/colors`),
      axios.get(`${API}/api/master/expense_categories`)
    ])
      .then(([brandsRes, typesRes, sizesRes, colorsRes, expenseCategoriesRes]) => {
        setBrands(brandsRes.data || []);
        setTypes(typesRes.data || []);
        setSizes(sizesRes.data || []);
        setColors(colorsRes.data || []);
        setExpenseCategories(expenseCategoriesRes.data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading master items:", err);
        setAlert({
          type: "danger",
          message: "Failed to load master data items from database."
        });
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const getCategoryDetails = (cat) => {
    if (cat === "brands") return { name: "Brands", label: "Brand Name", placeholder: "e.g. VKC, Bata" };
    if (cat === "types") return { name: "Product Types", label: "Product Type", placeholder: "e.g. Sandals, Clogs" };
    if (cat === "sizes") return { name: "Sizes", label: "Size (UK/US)", placeholder: "e.g. 8, 9, 10" };
    if (cat === "colors") return { name: "Colors", label: "Color Name", placeholder: "e.g. Cherry Red, Blue" };
    if (cat === "expense_categories") return { name: "Expense Categories", label: "Expense Category Name", placeholder: "e.g. Food & Tea, Travel" };
    return { name: "", label: "", placeholder: "" };
  };

  const handleOpenAddModal = (cat) => {
    setModalMode("add");
    setModalCategory(cat);
    setSelectedItem(null);
    setItemNameInput("");
    setModalError("");
    setShowModal(true);
  };

  const handleOpenEditModal = (cat, item) => {
    setModalMode("edit");
    setModalCategory(cat);
    setSelectedItem(item);
    setItemNameInput(item.name);
    setModalError("");
    setShowModal(true);
  };

  const handleModalSubmit = (e) => {
    e.preventDefault();
    if (!itemNameInput.trim()) {
      setModalError("Name cannot be empty");
      return;
    }

    setSubmitting(true);
    setModalError("");

    const url = modalMode === "add" 
      ? `${API}/api/master/${modalCategory}`
      : `${API}/api/master/${modalCategory}/${selectedItem.id}`;
    
    const request = modalMode === "add"
      ? axios.post(url, { name: itemNameInput.trim() })
      : axios.put(url, { name: itemNameInput.trim() });

    request
      .then(() => {
        setShowModal(false);
        fetchAllData();
        // Broadcast change so other components update dropdowns dynamically
        window.dispatchEvent(new Event("stock-updated"));
        
        const catDetails = getCategoryDetails(modalCategory);
        setAlert({
          type: "success",
          message: `Successfully ${modalMode === "add" ? "added" : "updated"} "${itemNameInput.trim()}" in ${catDetails.name}.`
        });
      })
      .catch((err) => {
        setModalError(err.response?.data?.error || "An error occurred while saving the item.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const handleDeleteItem = (cat, item) => {
    const catDetails = getCategoryDetails(cat);
    if (!window.confirm(`Are you sure you want to delete "${item.name}" from ${catDetails.name}?`)) {
      return;
    }

    axios
      .delete(`${API}/api/master/${cat}/${item.id}`)
      .then(() => {
        fetchAllData();
        window.dispatchEvent(new Event("stock-updated"));
        setAlert({
          type: "success",
          message: `Successfully deleted "${item.name}" from ${catDetails.name}.`
        });
      })
      .catch((err) => {
        setAlert({
          type: "danger",
          message: err.response?.data?.error || `Failed to delete item from ${catDetails.name}.`
        });
      });
  };

  // Local filtering based on query search
  const filteredBrands = brands.filter(b => b.name.toLowerCase().includes(searchBrands.toLowerCase()));
  const filteredTypes = types.filter(t => t.name.toLowerCase().includes(searchTypes.toLowerCase()));
  const filteredSizes = sizes.filter(s => s.name.toLowerCase().includes(searchSizes.toLowerCase()));
  const filteredColors = colors.filter(c => c.name.toLowerCase().includes(searchColors.toLowerCase()));
  const filteredExpenseCategories = expenseCategories.filter(ec => ec.name.toLowerCase().includes(searchExpenseCategories.toLowerCase()));

  const activeCategory = getCategoryDetails(modalCategory);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">Master Data</h1>
          <p className="text-sm font-semibold text-brand-subtext mt-1">Configure and manage slipper attributes used across the shop system</p>
        </div>
        <button
          onClick={fetchAllData}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-subtext hover:bg-slate-50 transition-colors shadow-sm"
          title="Refresh Lists"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Status alerts */}
      {alert.message && (
        <div className={`rounded-xl p-4 text-xs font-bold border flex items-start gap-2.5 ${
          alert.type === "success" 
            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
            : "bg-red-50 text-brand-danger border-red-200"
        }`}>
          {alert.type === "danger" ? <AlertTriangle className="h-4 w-4 shrink-0 text-brand-danger" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
          <div>{alert.message}</div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="h-6 w-6 animate-spin text-brand-primary mr-2" />
          <span className="text-xs font-bold text-brand-subtext">Loading master lists...</span>
        </div>
      )}

      {/* Main Grid displaying all four categories simultaneously */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* SECTION 1: BRANDS */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border/80 shadow-premium space-y-4">
          <h3 className="text-sm font-bold text-brand-text">Brands</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center">
              <Search className="h-3.5 w-3.5 text-brand-subtext" />
            </span>
            <input
              type="text"
              placeholder="Search brands..."
              value={searchBrands}
              onChange={(e) => setSearchBrands(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-border bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-brand-primary/60"
            />
          </div>
          <div className="border border-brand-border/60 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border/60 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-2">Brand Name</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredBrands.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-center text-brand-subtext font-normal text-[11px]">No brands found</td>
                  </tr>
                ) : (
                  filteredBrands.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{b.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <button
                          onClick={() => handleOpenEditModal("brands", b)}
                          className="text-brand-accent hover:underline"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">/</span>
                        <button
                          onClick={() => handleDeleteItem("brands", b)}
                          className="text-brand-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => handleOpenAddModal("brands")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-light text-brand-accent py-2 text-xs font-extrabold hover:bg-brand-primary hover:text-white transition-all w-full"
          >
            <Plus className="h-4 w-4" />
            Add Brand
          </button>
        </div>

        {/* SECTION 2: PRODUCT TYPES */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border/80 shadow-premium space-y-4">
          <h3 className="text-sm font-bold text-brand-text">Product Types</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center">
              <Search className="h-3.5 w-3.5 text-brand-subtext" />
            </span>
            <input
              type="text"
              placeholder="Search product types..."
              value={searchTypes}
              onChange={(e) => setSearchTypes(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-border bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-brand-primary/60"
            />
          </div>
          <div className="border border-brand-border/60 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border/60 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredTypes.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-center text-brand-subtext font-normal text-[11px]">No product types found</td>
                  </tr>
                ) : (
                  filteredTypes.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{t.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <button
                          onClick={() => handleOpenEditModal("types", t)}
                          className="text-brand-accent hover:underline"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">/</span>
                        <button
                          onClick={() => handleDeleteItem("types", t)}
                          className="text-brand-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => handleOpenAddModal("types")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-light text-brand-accent py-2 text-xs font-extrabold hover:bg-brand-primary hover:text-white transition-all w-full"
          >
            <Plus className="h-4 w-4" />
            Add Type
          </button>
        </div>

        {/* SECTION 3: SIZES */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border/80 shadow-premium space-y-4">
          <h3 className="text-sm font-bold text-brand-text">Sizes</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center">
              <Search className="h-3.5 w-3.5 text-brand-subtext" />
            </span>
            <input
              type="text"
              placeholder="Search sizes..."
              value={searchSizes}
              onChange={(e) => setSearchSizes(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-border bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-brand-primary/60"
            />
          </div>
          <div className="border border-brand-border/60 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border/60 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredSizes.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-center text-brand-subtext font-normal text-[11px]">No sizes found</td>
                  </tr>
                ) : (
                  filteredSizes.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{s.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <button
                          onClick={() => handleOpenEditModal("sizes", s)}
                          className="text-brand-accent hover:underline"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">/</span>
                        <button
                          onClick={() => handleDeleteItem("sizes", s)}
                          className="text-brand-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => handleOpenAddModal("sizes")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-light text-brand-accent py-2 text-xs font-extrabold hover:bg-brand-primary hover:text-white transition-all w-full"
          >
            <Plus className="h-4 w-4" />
            Add Size
          </button>
        </div>

        {/* SECTION 4: COLORS */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border/80 shadow-premium space-y-4">
          <h3 className="text-sm font-bold text-brand-text">Colors</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center">
              <Search className="h-3.5 w-3.5 text-brand-subtext" />
            </span>
            <input
              type="text"
              placeholder="Search colors..."
              value={searchColors}
              onChange={(e) => setSearchColors(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-border bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-brand-primary/60"
            />
          </div>
          <div className="border border-brand-border/60 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border/60 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-2">Color</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredColors.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-center text-brand-subtext font-normal text-[11px]">No colors found</td>
                  </tr>
                ) : (
                  filteredColors.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{c.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <button
                          onClick={() => handleOpenEditModal("colors", c)}
                          className="text-brand-accent hover:underline"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">/</span>
                        <button
                          onClick={() => handleDeleteItem("colors", c)}
                          className="text-brand-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => handleOpenAddModal("colors")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-light text-brand-accent py-2 text-xs font-extrabold hover:bg-brand-primary hover:text-white transition-all w-full"
          >
            <Plus className="h-4 w-4" />
            Add Color
          </button>
        </div>

        {/* SECTION 5: EXPENSE CATEGORIES */}
        <div className="bg-white p-5 rounded-2xl border border-brand-border/80 shadow-premium space-y-4">
          <h3 className="text-sm font-bold text-brand-text">Expense Categories</h3>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center">
              <Search className="h-3.5 w-3.5 text-brand-subtext" />
            </span>
            <input
              type="text"
              placeholder="Search expense categories..."
              value={searchExpenseCategories}
              onChange={(e) => setSearchExpenseCategories(e.target.value)}
              className="h-9 w-full rounded-lg border border-brand-border bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-brand-primary/60"
            />
          </div>
          <div className="border border-brand-border/60 rounded-xl overflow-hidden bg-white max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-brand-border/60 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                  <th className="px-4 py-2">Category Name</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-brand-text">
                {filteredExpenseCategories.length === 0 ? (
                  <tr>
                    <td colSpan="2" className="px-4 py-4 text-center text-brand-subtext font-normal text-[11px]">No expense categories found</td>
                  </tr>
                ) : (
                  filteredExpenseCategories.map((ec) => (
                    <tr key={ec.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-4 py-2.5 font-bold">{ec.name}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <button
                          onClick={() => handleOpenEditModal("expense_categories", ec)}
                          className="text-brand-accent hover:underline"
                        >
                          Edit
                        </button>
                        <span className="mx-1 text-slate-300">/</span>
                        <button
                          onClick={() => handleDeleteItem("expense_categories", ec)}
                          className="text-brand-danger hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => handleOpenAddModal("expense_categories")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-accent/30 bg-brand-light text-brand-accent py-2 text-xs font-extrabold hover:bg-brand-primary hover:text-white transition-all w-full"
          >
            <Plus className="h-4 w-4" />
            Add Category
          </button>
        </div>

      </div>

      {/* Modal Form Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl border border-brand-border shadow-premium overflow-hidden animate-slide-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-brand-border px-5 py-4 bg-slate-50/50">
              <h3 className="text-xs font-extrabold text-brand-text uppercase tracking-wider">
                {modalMode === "add" ? "Add New" : "Edit"} {activeCategory.name}
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
            <form onSubmit={handleModalSubmit} className="p-5 space-y-4">
              
              {/* Modal Error */}
              {modalError && (
                <div className="rounded-xl p-3 text-xs font-bold border bg-red-50 text-brand-danger border-red-200 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-brand-danger" />
                  <div>{modalError}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  {activeCategory.label} <span className="text-brand-danger">*</span>
                </label>
                <input
                  type="text"
                  value={itemNameInput}
                  onChange={(e) => setItemNameInput(e.target.value)}
                  placeholder={activeCategory.placeholder}
                  className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                  required
                  autoFocus
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all disabled:opacity-55"
                >
                  {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
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

export default MasterData;
