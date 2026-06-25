import { useState, useEffect, useRef } from "react";
import axios from "axios";
const API = import.meta.env.VITE_API_URL;
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Check, 
  AlertTriangle, 
  Receipt,
  Printer,
  X,
  CreditCard,
  Wallet,
  Coins,
  Filter,
  Boxes,
  PlusCircle,
  Search,
  User
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";

function Billing() {
  const { settings } = useSettings();


  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [allProducts, setAllProducts] = useState([]);
  const [qtyInput, setQtyInput] = useState(1);

  const [cart, setCart] = useState([]);
  const [billDiscountPercent, setBillDiscountPercent] = useState("0");
  const [applyGst, setApplyGst] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [billNo, setBillNo] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [smsWarning, setSmsWarning] = useState(false);

  const searchInputRef = useRef(null);
  const cartRef = useRef(null);

  // Generate a new unique Bill Number
  const generateBillNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `BILL-${year}${month}${day}-${rand}`;
  };

  // Fetch all products
  const fetchProducts = () => {
    axios
      .get(`${API}/api/products`)
      .then((res) => {
        if (res.data) {
          setAllProducts(res.data);
        }
      })
      .catch((err) => console.error("Error loading products:", err));
  };

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    setBillNo(generateBillNumber());
    fetchProducts();

    const handleStockUpdate = () => {
      fetchProducts();
    };

    window.addEventListener("stock-updated", handleStockUpdate);
    window.addEventListener("storage", handleStockUpdate);

    const handleOutsideClick = (e) => {
      if (!e.target.closest(".product-search-container")) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      window.removeEventListener("stock-updated", handleStockUpdate);
      window.removeEventListener("storage", handleStockUpdate);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const getSuggestions = () => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();

    // 1. First prioritize Brand Name (starts with matching)
    const brandMatches = allProducts.filter((p) =>
      p && p.brand && p.brand.toLowerCase().startsWith(query)
    );

    if (brandMatches.length > 0) {
      return brandMatches;
    }

    // 2. If no brand matches, fallback to Product Type or Serial Number (starts with matching)
    return allProducts.filter((p) =>
      p && (
        (p.type && p.type.toLowerCase().startsWith(query)) ||
        (p.serial_no && p.serial_no.toLowerCase().startsWith(query))
      )
    );
  };

  const handleSelectProduct = (prod) => {
    handleAddProductToCart(prod, 1);
    setSearchQuery("");
    setShowSuggestions(false);

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    setTimeout(() => {
      cartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
  };

  // Add selected product and quantity to billing cart
  const handleAddProductToCart = (prod, qty) => {
    if (qty <= 0) return;

    // Check if item is already in cart
    const existingIndex = cart.findIndex((item) => item.id === prod.id);
    let newQty = qty;

    if (existingIndex > -1) {
      newQty = cart[existingIndex].quantity + qty;
    }

    if (newQty > prod.stock) {
      alert(`Cannot add more. Only ${prod.stock} pairs available in stock.`);
      return;
    }

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity = newQty;
      setCart(updatedCart);
    } else {
      const selling = parseFloat(prod.selling_price);
      const discountAmount = (selling * parseFloat(prod.discount_percent || 0)) / 100;
      const finalPrice = selling - discountAmount;

      setCart([
        ...cart,
        {
          id: prod.id,
          serial_no: prod.serial_no,
          brand: prod.brand,
          type: prod.type,
          size: prod.size,
          color: prod.color,
          purchase_price: parseFloat(prod.purchase_price),
          original_selling: selling,
          selling_price: finalPrice, // unit price charged
          discount_percent: parseFloat(prod.discount_percent || 0),
          stock: prod.stock,
          quantity: qty
        }
      ]);
    }
  };

  // Cart quantity modifiers
  const updateQty = (id, change) => {
    const updatedCart = cart.map((item) => {
      if (item.id === id) {
        const newQty = item.quantity + change;
        if (newQty > item.stock) {
          alert(`Enforcing inventory limit. Only ${item.stock} in stock.`);
          return item;
        }
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean);

    setCart(updatedCart);
  };

  const removeFromCart = (id) => {
    setCart(cart.filter((item) => item.id !== id));
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
  const billDiscountAmt = (subtotal * parseFloat(billDiscountPercent || 0)) / 100;
  const taxableAmt = subtotal - billDiscountAmt;
  const gstAmt = applyGst ? (taxableAmt * 18) / 100 : 0;
  const totalBillAmt = taxableAmt + gstAmt;

  // Calculate profit: actual sale price charged minus cost price
  const totalProfitAmt = cart.reduce((sum, item) => {
    const itemBillDiscountRatio = (100 - parseFloat(billDiscountPercent || 0)) / 100;
    const finalItemSellingPrice = item.selling_price * itemBillDiscountRatio;
    const itemProfit = finalItemSellingPrice - item.purchase_price;
    return sum + (itemProfit * item.quantity);
  }, 0);

  // Checkout submission
  const handleCheckout = () => {
    if (cart.length === 0) {
      setErrorMessage("Your billing cart is empty!");
      return;
    }

    setErrorMessage("");
    const salePayload = {
      bill_no: billNo,
      discount: billDiscountAmt,
      gst: gstAmt,
      total_price: totalBillAmt,
      total_profit: totalProfitAmt,
      payment_method: paymentMethod,
      customer_name: customerName,
      customer_phone: customerPhone,
      items: cart.map((item) => ({
        product_id: item.id,
        serial_no: item.serial_no,
        brand: item.brand,
        type: item.type,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        purchase_price: item.purchase_price,
        selling_price: item.selling_price, // Unit price after item discount
        profit: (item.selling_price - item.purchase_price) * item.quantity // Subtotal profit
      }))
    };

    axios
      .post(`${API}/api/sales`, salePayload)
      .then((res) => {
        setCheckoutSuccess(true);
        setSmsWarning(!!res.data.smsWarning);
        setInvoiceData({
          bill_no: billNo,
          date: new Date(),
          items: [...cart],
          subtotal,
          discountPercent: billDiscountPercent,
          discountAmount: billDiscountAmt,
          applyGst,
          gstAmount: gstAmt,
          total: totalBillAmt,
          paymentMethod,
          customer_name: customerName || "Walk-in Customer",
          customer_phone: customerPhone || ""
        });
        setShowInvoiceModal(true);
        
        window.dispatchEvent(new Event("stock-updated"));

        // Reset states
        setCart([]);
        setBillDiscountPercent("0");
        setApplyGst(false);
        setCustomerName("");
        setCustomerPhone("");
        setBillNo(generateBillNumber());
      })
      .catch((err) => {
        setErrorMessage(err.response?.data?.error || "Billing checkout failed. Please retry.");
      });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCloseInvoice = () => {
    setShowInvoiceModal(false);
    setCheckoutSuccess(false);
    setInvoiceData(null);
    setSmsWarning(false);
  };



  const handleKeyDown = (e) => {
    const suggestions = getSuggestions();
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        handleSelectProduct(suggestions[focusedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up no-print">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">Point of Sale (POS)</h1>
        <p className="text-sm font-semibold text-brand-subtext mt-1">Select products, generate customer receipts, and sync inventory levels</p>
      </div>

      {/* Customer Information Section */}
      <div className="rounded-2xl p-5 shadow-premium border border-[#BFDBFE] bg-[#EFF6FF] space-y-4">
        <div className="flex items-center gap-2 text-[#1E40AF]">
          <User className="h-5 w-5" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider">Customer Information</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#1E40AF]/80 mb-2">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Rajesh Kumar (Optional)"
              className="h-10 w-full rounded-xl border border-[#BFDBFE] bg-white px-3.5 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#1E40AF]/80 mb-2">Mobile Number</label>
            <input
              type="text"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. 9876543210 (Optional)"
              className="h-10 w-full rounded-xl border border-[#BFDBFE] bg-white px-3.5 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
            />
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Left Column: Product Search & Billing Cart */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Product search card */}
          <div className="glass-card rounded-2xl p-5 shadow-premium space-y-5">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-brand-accent" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-subtext">Product Selection</h3>
            </div>

            <div className="product-search-container relative">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Search Product (Brand, Type, Size, Color, Serial No)</label>
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type to search product... e.g. Adi, Blue, 8"
                  className="h-11 w-full rounded-xl border border-brand-border bg-white pl-10 pr-4 text-xs font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              </div>
              {showSuggestions && searchQuery.trim() && (
                <div className="relative z-20 mt-2 max-h-[250px] overflow-y-auto rounded-xl border border-brand-border bg-white shadow-premium w-full">
                  {(() => {
                    const suggestions = getSuggestions();
                    if (suggestions.length === 0) {
                      return (
                        <div className="px-4 py-3 text-xs text-brand-subtext font-semibold">
                          No matching products found
                        </div>
                      );
                    }
                    return suggestions.map((prod, index) => {
                      const isOutOfStock = prod.stock <= 0;
                      const isFocused = index === focusedIndex;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleSelectProduct(prod)}
                          className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-xs transition-colors border-b border-slate-100 last:border-0 ${
                            isFocused ? "bg-brand-light text-brand-accent font-bold" : "hover:bg-slate-50"
                          }`}
                        >
                          <div>
                            <span className="font-bold text-brand-text">
                              {prod.brand} {prod.type} {prod.color} Size {prod.size}
                            </span>
                            <span className="text-[10px] text-brand-subtext block font-medium">
                              SKU: {prod.serial_no}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-brand-accent block">
                              ₹{parseFloat(prod.selling_price).toFixed(2)}
                            </span>
                            <span className={`text-[10px] font-bold ${isOutOfStock ? "text-brand-danger" : "text-brand-subtext"}`}>
                              {isOutOfStock ? "Out of Stock" : `Stock: ${prod.stock}`}
                            </span>
                          </div>
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Cart Table List */}
          {cart.length > 0 && (
            <div className="glass-card rounded-2xl p-6 shadow-premium animate-slide-up" ref={cartRef}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold text-brand-text">
                  <ShoppingCart className="h-5 w-5 text-brand-accent" />
                  Billing Cart Items
                </h3>
                <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-bold text-brand-accent">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} Items Added
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-brand-border bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-brand-subtext">
                      <th className="px-4 py-3.5">Product</th>
                      <th className="px-4 py-3.5 text-center">Qty</th>
                      <th className="px-4 py-3.5 text-right">Price</th>
                      <th className="px-4 py-3.5 text-right">Total</th>
                      <th className="px-4 py-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {cart.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/30">
                        <td className="px-4 py-4 md:py-5">
                          <p className="font-bold text-brand-text text-sm">{item.brand} {item.type}</p>
                          <p className="text-[11px] text-brand-subtext font-semibold mt-1">
                            Size: {item.size} <span className="mx-1.5 text-slate-300">|</span> Color: {item.color}
                          </p>
                          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Stock: {item.stock} available</span>
                        </td>
                        <td className="px-4 py-4 md:py-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => updateQty(item.id, -1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center font-bold text-brand-text text-sm">{item.quantity}</span>
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand-border bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 md:py-5 text-right font-semibold text-brand-text text-sm">
                          <p>₹{item.selling_price.toFixed(2)}</p>
                          {item.discount_percent > 0 && (
                            <span className="text-[9px] font-bold text-emerald-600 block">MRP: ₹{item.original_selling}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 md:py-5 text-right font-extrabold text-brand-text text-sm">
                          ₹{(item.selling_price * item.quantity).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 md:py-5 text-center">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-danger hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Invoice Calculations */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 shadow-premium space-y-5">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-brand-text">
              <Receipt className="h-5 w-5 text-brand-accent" />
              Invoice Calculations
            </h3>

            {errorMessage && (
              <div className="rounded-xl bg-red-50 p-3 text-xs font-bold text-brand-danger border border-red-200">
                {errorMessage}
              </div>
            )}

            {/* Bill Details */}
            <div className="space-y-3 font-semibold text-xs border-b border-brand-border pb-4">
              <div className="flex justify-between">
                <span className="text-brand-subtext">Invoice Bill No</span>
                <span className="text-brand-text font-bold uppercase">{billNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-subtext">GST Category</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-brand-text font-bold">
                  <input
                    type="checkbox"
                    checked={applyGst}
                    onChange={(e) => setApplyGst(e.target.checked)}
                    className="rounded border-slate-300 text-brand-accent focus:ring-brand-accent"
                  />
                  <span>Apply 18% GST</span>
                </label>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-brand-subtext">Special Bill Discount (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={billDiscountPercent}
                  onChange={(e) => setBillDiscountPercent(e.target.value)}
                  className="h-8 w-16 text-center rounded-lg border border-brand-border outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            {/* Breakdown Summaries */}
            <div className="space-y-3 font-semibold text-xs border-b border-brand-border pb-4">
              <div className="flex justify-between">
                <span className="text-brand-subtext">Items Subtotal</span>
                <span className="text-brand-text">₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-brand-danger">
                <span className="text-brand-subtext">Bill Discount</span>
                <span>-₹{billDiscountAmt.toFixed(2)}</span>
              </div>
              {applyGst && (
                <div className="flex justify-between">
                  <span className="text-brand-subtext">CGST (9%) + SGST (9%)</span>
                  <span className="text-brand-text">₹{gstAmt.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Total Grand Amount */}
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-brand-text">Grand Total</span>
              <span className="text-2xl font-extrabold text-brand-accent">₹{totalBillAmt.toFixed(2)}</span>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-brand-subtext">Payment Mode</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Cash", icon: Coins },
                  { name: "UPI", icon: Wallet },
                  { name: "Card", icon: CreditCard },
                ].map((mode) => {
                  const Icon = mode.icon;
                  const selected = paymentMethod === mode.name;
                  return (
                    <button
                      key={mode.name}
                      type="button"
                      onClick={() => setPaymentMethod(mode.name)}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border font-bold text-xs transition-all ${
                        selected 
                           ? "bg-brand-light border-brand-primary/60 text-brand-accent shadow-inner" 
                          : "bg-white border-brand-border text-brand-subtext hover:bg-slate-50 hover:text-brand-text"
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                      <span>{mode.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-accent py-4 text-sm font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 hover:shadow-lg disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              <Check className="h-5 w-5" />
              Checkout & Print Bill
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Modal for Screen View */}
      {showInvoiceModal && invoiceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-brand-border animate-slide-up max-h-[90vh] flex flex-col justify-between">
            {/* Modal header options */}
            <div className="mb-4 flex items-center justify-between border-b border-brand-border pb-3">
              <div className="flex items-center gap-2 text-brand-accent">
                <Receipt className="h-5 w-5" />
                <h3 className="text-sm font-extrabold text-brand-text">Checkout Completed Successfully</h3>
              </div>
              <button onClick={handleCloseInvoice} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {smsWarning && (
              <div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-700 border border-amber-200 flex items-start gap-2 no-print">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                <span>Sale completed successfully. SMS notification could not be delivered.</span>
              </div>
            )}

            {/* Printable Invoice Area */}
            <div className="print-area flex-1 overflow-y-auto pr-1">
              <div className="text-center pb-4 border-b border-dashed border-slate-200">
                {settings.shop_logo && (
                  <div className="mx-auto mb-2 h-12 w-12 overflow-hidden rounded-xl border border-slate-100 flex items-center justify-center p-0.5 shadow-sm">
                    <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
                  </div>
                )}
                <h2 className="text-base font-extrabold text-brand-text uppercase tracking-wide">{settings.shop_name}</h2>
                <p className="text-[10px] text-brand-subtext font-semibold mt-1">{settings.shop_address}</p>
                <p className="text-[10px] text-brand-subtext font-semibold">Phone: {settings.shop_phone} | GSTIN: {localStorage.getItem("settings_shopGst") || "33AAAAA1234A1Z1"}</p>
              </div>

              <div className="py-3.5 border-b border-slate-100 text-[10px] font-semibold text-brand-text grid grid-cols-2 gap-y-1">
                <div>Invoice No: <span className="font-bold">{invoiceData.bill_no}</span></div>
                <div className="text-right">Date: <span className="font-bold">{invoiceData.date.toLocaleString()}</span></div>
                <div>Cashier: <span className="font-bold">Admin</span></div>
                <div className="text-right">Payment: <span className="font-bold uppercase">{invoiceData.paymentMethod}</span></div>
                <div>Customer Name: <span className="font-bold">{invoiceData.customer_name || "Walk-in Customer"}</span></div>
                {invoiceData.customer_phone && (
                  <div className="text-right">Mobile Number: <span className="font-bold">{invoiceData.customer_phone}</span></div>
                )}
              </div>

              {/* Items List */}
              <table className="w-full text-left text-[10px] font-semibold mt-4">
                <thead>
                  <tr className="border-b border-slate-200 text-brand-subtext uppercase">
                    <th className="py-1">Item Description</th>
                    <th className="py-1 text-center">Qty</th>
                    <th className="py-1 text-right">Rate</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-brand-text">
                  {invoiceData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2">
                        <div>{item.brand} {item.type}</div>
                        <span className="text-[9px] text-brand-subtext font-semibold">Size: {item.size} | Color: {item.color}</span>
                      </td>
                      <td className="py-2 text-center">{item.quantity}</td>
                      <td className="py-2 text-right">₹{item.selling_price.toFixed(2)}</td>
                      <td className="py-2 text-right">₹{(item.selling_price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Invoice Totals */}
              <div className="border-t border-dashed border-slate-200 mt-4 pt-3 text-[10px] font-semibold text-brand-text space-y-1.5 max-w-[200px] ml-auto">
                <div className="flex justify-between">
                  <span className="text-brand-subtext">Subtotal:</span>
                  <span>₹{invoiceData.subtotal.toFixed(2)}</span>
                </div>
                {parseFloat(invoiceData.discountAmount) > 0 && (
                  <div className="flex justify-between text-brand-danger">
                    <span className="text-brand-subtext">Discount ({invoiceData.discountPercent}%):</span>
                    <span>-₹{invoiceData.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {invoiceData.applyGst && (
                  <div className="flex justify-between">
                    <span className="text-brand-subtext">GST (18%):</span>
                    <span>₹{invoiceData.gstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs font-bold">
                  <span className="text-brand-text">Grand Total:</span>
                  <span className="text-brand-accent">₹{invoiceData.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Invoice Bottom note */}
              <div className="text-center border-t border-dashed border-slate-200 mt-6 pt-4">
                <p className="text-[10px] font-bold text-brand-text">Thank You for Shopping with Us!</p>
                <p className="text-[9px] text-brand-subtext font-medium mt-0.5">Goods once sold cannot be returned. Only exchange within 7 days.</p>
              </div>
            </div>

            {/* Print Options */}
            <div className="mt-6 flex gap-3 border-t border-brand-border pt-4 no-print">
              <button
                onClick={handleCloseInvoice}
                className="flex-1 rounded-xl border border-brand-border bg-white py-3 text-xs font-bold text-brand-subtext hover:bg-slate-50 text-center"
              >
                Close Receipt
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-accent py-3 text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 text-center"
              >
                <Printer className="h-4.5 w-4.5" />
                Print (PDF)
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

export default Billing;