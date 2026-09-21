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
  User,
  Barcode
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";

function Billing() {
  const { settings } = useSettings();


  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [scanToast, setScanToast] = useState({ show: false, message: "" });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [allProducts, setAllProducts] = useState([]);
  const [qtyInput, setQtyInput] = useState(1);

  const [loadedProduct, setLoadedProduct] = useState(null);
  const [searchError, setSearchError] = useState("");
  const barcodeInputRef = useRef(null);
  const barcodeTimeoutRef = useRef(null);

  const [cart, setCart] = useState([]);
  const [billDiscountPercent, setBillDiscountPercent] = useState("0");
  const [applyGst, setApplyGst] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNameError, setCustomerNameError] = useState("");
  const [customerPhoneError, setCustomerPhoneError] = useState("");

  const [billNo, setBillNo] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [smsWarning, setSmsWarning] = useState(false);

  // ── Validation helpers ──────────────────────────────────────────────────────
  // Customer name: letters (A-Z a-z) and spaces only
  const CUSTOMER_NAME_REGEX = /^[A-Za-z ]+$/;
  // Indian mobile: exactly 10 digits starting with 6, 7, 8, or 9
  const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;

  const handleCustomerNameChange = (e) => {
    const raw = e.target.value;
    // Allow only letters and spaces while typing (block digits/special chars)
    const filtered = raw.replace(/[^A-Za-z ]/g, "");
    setCustomerName(filtered);
    if (filtered === "") {
      setCustomerNameError("");
    } else if (!CUSTOMER_NAME_REGEX.test(filtered.trim())) {
      setCustomerNameError("Customer name can contain letters and spaces only.");
    } else {
      setCustomerNameError("");
    }
  };

  const handleCustomerPhoneChange = (e) => {
    const raw = e.target.value;
    // Allow only digits while typing; enforce max 10
    const filtered = raw.replace(/[^0-9]/g, "").slice(0, 10);
    setCustomerPhone(filtered);
    if (filtered === "") {
      setCustomerPhoneError("");
    } else if (!INDIAN_MOBILE_REGEX.test(filtered)) {
      setCustomerPhoneError("Enter a valid 10-digit mobile number.");
    } else {
      setCustomerPhoneError("");
    }
  };

  // Returns true if customer info is valid (or empty — walk-in)
  const validateCustomerInfo = () => {
    let valid = true;
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (trimmedName !== "") {
      if (!CUSTOMER_NAME_REGEX.test(trimmedName)) {
        setCustomerNameError("Customer name can contain letters and spaces only.");
        valid = false;
      } else {
        setCustomerNameError("");
      }
    } else {
      setCustomerNameError("");
    }

    if (trimmedPhone !== "") {
      if (!INDIAN_MOBILE_REGEX.test(trimmedPhone)) {
        setCustomerPhoneError("Enter a valid 10-digit mobile number.");
        valid = false;
      } else {
        setCustomerPhoneError("");
      }
    } else {
      setCustomerPhoneError("");
    }

    return valid;
  };

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

  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High beep
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (err) {
      console.warn("Could not play scan sound:", err);
    }
  };

  const processBarcodeScan = (barcode) => {
    if (!barcode) return;
    
    // Clear input immediately to allow rapid successive scans
    setBarcodeQuery("");
    
    axios.get(`${API}/api/products/barcode/${encodeURIComponent(barcode)}`)
      .then((res) => {
        const prod = res.data;
        if (!prod) return;

        if (prod.stock <= 0) {
          alert(`Cannot add. ${prod.brand} ${prod.type} is out of stock.`);
          barcodeInputRef.current?.focus();
          return;
        }

        // Display scanned product details in POS UI
        setLoadedProduct(prod);

        const existingIndex = cart.findIndex((item) => item.id === prod.id);
        let newQty = 1;

        if (existingIndex > -1) {
          newQty = cart[existingIndex].quantity + 1;
        }

        if (newQty > prod.stock) {
          alert(`Enforcing inventory limit. Only ${prod.stock} in stock.`);
          barcodeInputRef.current?.focus();
          return;
        }

        if (existingIndex > -1) {
          const updatedCart = [...cart];
          updatedCart[existingIndex].quantity = newQty;
          setCart(updatedCart);
        } else {
          const selling = parseFloat(prod.selling_price);
          const discountPercent = parseFloat(prod.discount_percent || 0);
          const discountAmount = (selling * discountPercent) / 100;
          const finalPrice = selling - discountAmount;

          setCart((prevCart) => [
            ...prevCart,
            {
              id: prod.id,
              serial_no: prod.serial_no,
              article_number: prod.article_number,
              brand: prod.brand,
              type: prod.type,
              size: prod.size,
              color: prod.color,
              purchase_price: parseFloat(prod.purchase_price),
              original_selling: selling,
              selling_price: finalPrice,
              discount_percent: discountPercent,
              stock: prod.stock,
              quantity: 1
            }
          ]);
        }

        playSuccessBeep();
        
        setScanToast({
          show: true,
          message: `Scanned: ${prod.brand} ${prod.type} [Size: ${prod.size}, Color: ${prod.color}]`
        });
        
        setTimeout(() => {
          setScanToast({ show: false, message: "" });
        }, 2000);

        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 50);
      })
      .catch((err) => {
        console.error("Error looking up barcode:", err);
        alert(err.response?.data?.error || `Failed to find product for barcode ${barcode}`);
        barcodeInputRef.current?.focus();
      });
  };

  const handleBarcodeKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = e.target.value.trim();
      if (code) {
        processBarcodeScan(code);
      }
    }
  };

  const handleBarcodeChange = (e) => {
    const value = e.target.value;
    setBarcodeQuery(value);

    if (barcodeTimeoutRef.current) {
      clearTimeout(barcodeTimeoutRef.current);
    }

    if (value.trim()) {
      barcodeTimeoutRef.current = setTimeout(() => {
        processBarcodeScan(value.trim());
      }, 150);
    }
  };

  // Continuously focus barcode scanner input
  useEffect(() => {
    const keepFocus = () => {
      const activeEl = document.activeElement;
      if (
        activeEl && 
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") && 
        activeEl !== barcodeInputRef.current
      ) {
        return;
      }
      barcodeInputRef.current?.focus();
    };

    keepFocus();
    document.addEventListener("click", keepFocus);
    return () => {
      document.removeEventListener("click", keepFocus);
    };
  }, []);

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

  // Lookup article number in-memory from preloaded allProducts
  useEffect(() => {
    if (!searchQuery.trim()) {
      setLoadedProduct(null);
      setSearchError("");
      return;
    }

    const queryLower = searchQuery.trim().toLowerCase();
    const exactMatch = allProducts.find(
      (p) => p.article_number && p.article_number.toLowerCase() === queryLower
    );

    if (exactMatch) {
      setLoadedProduct(exactMatch);
      setSearchError("");
    } else {
      setLoadedProduct(null);
      // Only set error if search query does not match any prefix (or suggestions are empty)
      const matchesPrefix = allProducts.some(
        (p) => p.article_number && p.article_number.toLowerCase().includes(queryLower)
      );
      if (!matchesPrefix) {
        setSearchError("Article Number not found.");
      } else {
        setSearchError("");
      }
    }
  }, [searchQuery, allProducts]);

  const getSuggestions = () => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return allProducts.filter((p) =>
      p && p.article_number && p.article_number.toLowerCase().includes(query)
    );
  };

  const handleAddLoadedToCart = (e) => {
    if (e) e.preventDefault();
    if (!loadedProduct) return;
    
    const qty = parseInt(qtyInput);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }

    if (qty > loadedProduct.stock) {
      alert(`Cannot add more. Only ${loadedProduct.stock} pairs available in stock.`);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.article_number === loadedProduct.article_number);
    let newQty = qty;

    if (existingIndex > -1) {
      newQty = cart[existingIndex].quantity + qty;
    }

    if (newQty > loadedProduct.stock) {
      alert(`Cannot add more. Only ${loadedProduct.stock} pairs available in stock.`);
      return;
    }

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity = newQty;
      setCart(updatedCart);
    } else {
      const selling = parseFloat(loadedProduct.selling_price);
      const discountPercent = parseFloat(loadedProduct.discount_percent || 0);
      const discountAmount = (selling * discountPercent) / 100;
      const finalPrice = selling - discountAmount;

      const pId = loadedProduct.id || allProducts.find(p => p.article_number === loadedProduct.article_number)?.id || 0;

      setCart([
        ...cart,
        {
          id: pId,
          serial_no: loadedProduct.serial_no,
          article_number: loadedProduct.article_number,
          brand: loadedProduct.brand,
          type: loadedProduct.type,
          size: loadedProduct.size,
          color: loadedProduct.color,
          purchase_price: parseFloat(loadedProduct.purchase_price),
          original_selling: selling,
          selling_price: finalPrice,
          discount_percent: discountPercent,
          stock: loadedProduct.stock,
          quantity: qty
        }
      ]);
    }

    setSearchQuery("");
    setQtyInput(1);
    setLoadedProduct(null);

    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    setTimeout(() => {
      cartRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
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

    // Validate customer fields before proceeding
    if (!validateCustomerInfo()) {
      setErrorMessage("Please fix the customer information errors before checkout.");
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
        window.dispatchEvent(new Event("customer-updated"));
        localStorage.setItem("last_checkout_timestamp", Date.now().toString());

        // Reset states
        setCart([]);
        setBillDiscountPercent("0");
        setApplyGst(false);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerNameError("");
        setCustomerPhoneError("");
        setBillNo(generateBillNumber());

        // Automatically trigger print dialog
        setTimeout(() => {
          window.print();
        }, 500);
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

    if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setFocusedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        const selected = suggestions[focusedIndex];
        if (selected.stock > 0) {
          setSearchQuery(selected.article_number);
          setShowSuggestions(false);
        } else {
          alert("Cannot select out of stock product.");
        }
      } else if (loadedProduct) {
        if (loadedProduct.stock > 0) {
          handleAddLoadedToCart();
        } else {
          alert("Product is out of stock.");
        }
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">Point of Sale (POS)</h1>
        <p className="text-[18px] font-medium text-brand-subtext mt-1">Select products, generate customer receipts, and sync inventory levels</p>
      </div>

      {/* Customer Information Section */}
      <div className="rounded-2xl p-6 shadow-premium border border-[#BFDBFE] bg-[#EFF6FF] space-y-4">
        <div className="flex items-center gap-2 text-[#1E40AF]">
          <User className="h-6 w-6" />
          <h3 className="text-[20px] font-bold uppercase tracking-wider">Customer Information</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-[#1E40AF]/80 mb-2">Customer Name</label>
            <input
              id="customer-name-input"
              type="text"
              value={customerName}
              onChange={handleCustomerNameChange}
              placeholder="e.g. Rajesh Kumar (Optional)"
              maxLength={80}
              className={`h-12 w-full rounded-xl border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:ring-2 focus:ring-brand-primary/10 transition-colors ${
                customerNameError
                  ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                  : "border-[#BFDBFE] focus:border-brand-primary/60"
              }`}
            />
            {customerNameError && (
              <p id="customer-name-error" className="mt-1.5 text-[13px] font-bold text-red-600 flex items-center gap-1">
                <span>⚠</span> {customerNameError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-[15px] font-bold uppercase tracking-wider text-[#1E40AF]/80 mb-2">Mobile Number</label>
            <input
              id="customer-phone-input"
              type="text"
              inputMode="numeric"
              value={customerPhone}
              onChange={handleCustomerPhoneChange}
              placeholder="e.g. 9876543210 (Optional)"
              maxLength={10}
              className={`h-12 w-full rounded-xl border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:ring-2 focus:ring-brand-primary/10 transition-colors ${
                customerPhoneError
                  ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                  : "border-[#BFDBFE] focus:border-brand-primary/60"
              }`}
            />
            {customerPhoneError && (
              <p id="customer-phone-error" className="mt-1.5 text-[13px] font-bold text-red-600 flex items-center gap-1">
                <span>⚠</span> {customerPhoneError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Left Column: Product Search & Billing Cart */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Product selection card */}
          <div className="glass-card rounded-2xl p-6 shadow-premium space-y-5">
            <div className="flex items-center gap-2">
              <Search className="h-6 w-6 text-brand-accent" />
              <h3 className="text-[20px] font-bold uppercase tracking-wider text-brand-subtext">Product Selection</h3>
            </div>

            {scanToast.show && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] font-bold text-emerald-800 animate-pulse flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                {scanToast.message}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Barcode Scanner Input */}
              <div className="relative">
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Barcode Scanner (USB input)</label>
                <div className="relative">
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeQuery}
                    onChange={handleBarcodeChange}
                    onKeyDown={handleBarcodeKeyDown}
                    placeholder="Scan barcode directly..."
                    className="h-12 w-full rounded-xl border border-brand-border bg-slate-50/50 pl-11 pr-4 text-[16px] font-bold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                  />
                  <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
              </div>

              {/* Article Number Search with autocomplete */}
              <div className="product-search-container relative">
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Manual Search (Article Number)</label>
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
                    placeholder="Type article number... e.g. ART1001"
                    className="h-12 w-full rounded-xl border border-brand-border bg-white pl-11 pr-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 uppercase"
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                </div>
                {searchError && (
                  <p className="text-[14px] font-bold text-brand-danger mt-1.5">{searchError}</p>
                )}
                {showSuggestions && searchQuery.trim() && (
                  <div className="absolute z-20 mt-2 max-h-[220px] overflow-y-auto rounded-xl border border-brand-border bg-white shadow-premium w-full animate-slide-up">
                    {(() => {
                      const suggestions = getSuggestions();
                      if (suggestions.length === 0) {
                        return (
                          <div className="px-4 py-3 text-[15px] text-brand-subtext font-semibold">
                            No matching products found
                          </div>
                        );
                      }
                      return suggestions.map((prod, index) => {
                        const isFocused = index === focusedIndex;
                        const isOutOfStock = prod.stock <= 0;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            disabled={isOutOfStock}
                            onClick={() => {
                              if (!isOutOfStock) {
                                setSearchQuery(prod.article_number);
                                setShowSuggestions(false);
                              }
                            }}
                            className={`flex w-full items-center justify-between px-4 py-3 text-left text-[15px] transition-colors border-b border-slate-100 last:border-0 ${
                              isOutOfStock 
                                ? "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400" 
                                : isFocused 
                                  ? "bg-brand-light text-brand-accent font-bold" 
                                  : "hover:bg-slate-50"
                            }`}
                          >
                            <span className="font-bold text-brand-text">
                              {prod.article_number} {isOutOfStock && <span className="ml-1 text-[12px] font-bold text-brand-danger bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Out of stock</span>}
                            </span>
                            <span className="text-[14px] text-brand-subtext">{prod.brand} {prod.type} (Size {prod.size})</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>

              {/* Autofilled Fields Grid */}
              <div className="grid grid-cols-2 gap-4 border border-brand-border rounded-xl p-5 bg-slate-50/50 text-[16px] font-semibold text-brand-text">
                <div className="col-span-2 flex justify-between items-center border-b border-brand-border pb-2.5">
                  <div>
                    <span className="text-[14px] uppercase text-brand-subtext font-bold block">Article Number</span>
                    <span className="text-[18px] font-extrabold text-brand-accent mt-0.5 block">{loadedProduct ? loadedProduct.article_number : "-"}</span>
                  </div>
                  {loadedProduct && loadedProduct.barcode && (
                    <span className="text-[14px] font-mono font-bold text-slate-600 bg-slate-200/80 px-2.5 py-1 rounded">
                      {loadedProduct.barcode}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Brand</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? loadedProduct.brand : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Product Type</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? loadedProduct.type : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Size</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? loadedProduct.size : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Color</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? loadedProduct.color : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Selling Price</span>
                  <span className="text-[16px] font-bold text-brand-accent mt-0.5 block">{loadedProduct ? `₹${Number(loadedProduct.selling_price).toFixed(2)}` : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Purchase Price</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? `₹${Number(loadedProduct.purchase_price).toFixed(2)}` : "-"}</span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Available Stock</span>
                  <span className={`text-[16px] font-extrabold mt-0.5 block ${loadedProduct && loadedProduct.stock === 0 ? "text-brand-danger" : "text-brand-text"}`}>
                    {loadedProduct ? `${loadedProduct.stock} pairs` : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[14px] uppercase text-brand-subtext font-bold block">Supplier</span>
                  <span className="text-[16px] font-bold text-brand-text mt-0.5 block">{loadedProduct ? (loadedProduct.supplier || loadedProduct.supplier_name || "-") : "-"}</span>
                </div>
                {loadedProduct && loadedProduct.stock === 0 && (
                  <div className="col-span-2 text-center pt-2">
                    <span className="inline-block rounded-lg bg-red-50 px-3 py-1 text-[14px] font-extrabold uppercase text-brand-danger border border-red-100 animate-pulse">
                      Out Of Stock
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity & Add to Cart Section */}
              <div className="flex gap-4 items-end">
                <div className="w-1/3">
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(parseInt(e.target.value) || 1)}
                    disabled={!loadedProduct || loadedProduct.stock === 0}
                    className="h-12 w-full rounded-xl border border-brand-border bg-white px-3.5 text-center font-bold text-[16px] outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 disabled:bg-slate-50"
                  />
                </div>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={handleAddLoadedToCart}
                    disabled={!loadedProduct || loadedProduct.stock === 0}
                    className={`w-full flex h-12 items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white shadow-md transition-all ${
                      loadedProduct && loadedProduct.stock === 0
                        ? "bg-slate-200 text-slate-400 shadow-none cursor-not-allowed"
                        : "bg-brand-accent hover:bg-blue-600 shadow-brand-accent/25"
                    }`}
                  >
                    <PlusCircle className="h-5 w-5" />
                    <span>{loadedProduct && loadedProduct.stock === 0 ? "Out of Stock" : "Add to Cart"}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Cart Table List */}
          {cart.length > 0 && (
            <div className="glass-card rounded-2xl p-7 shadow-premium animate-slide-up" ref={cartRef}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[20px] font-bold text-brand-text">
                  <ShoppingCart className="h-6 w-6 text-brand-accent" />
                  Billing Cart Items
                </h3>
                <span className="rounded-full bg-brand-light px-3.5 py-1 text-[15px] font-bold text-brand-accent">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} Items Added
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[16px] min-w-[600px]">
                  <thead>
                    <tr className="border-b border-brand-border bg-slate-50 text-[16px] font-semibold uppercase tracking-wider text-brand-subtext">
                      <th className="px-5 py-4">Product</th>
                      <th className="px-5 py-4 text-center">Qty</th>
                      <th className="px-5 py-4 text-right">Price</th>
                      <th className="px-5 py-4 text-right">Total</th>
                      <th className="px-5 py-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-brand-text">
                    {cart.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/30">
                        <td className="px-5 py-4 md:py-5">
                          <p className="font-bold text-brand-text text-[16px]">{item.brand} {item.type}</p>
                          <p className="text-[14px] text-brand-subtext font-medium mt-1">
                            Art No: <span className="text-brand-accent font-bold">{item.article_number}</span> <span className="mx-1.5 text-slate-300">|</span> Size: {item.size} <span className="mx-1.5 text-slate-300">|</span> Color: {item.color}
                          </p>
                          <span className="text-[13px] text-slate-400 font-medium block mt-0.5">Stock: {item.stock} available</span>
                        </td>
                        <td className="px-5 py-4 md:py-5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => updateQty(item.id, -1)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-8 text-center font-bold text-brand-text text-[16px]">{item.quantity}</span>
                            <button
                              onClick={() => updateQty(item.id, 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4 md:py-5 text-right font-medium text-brand-text text-[16px]">
                          <p>₹{item.selling_price.toFixed(2)}</p>
                          {item.discount_percent > 0 && (
                            <span className="text-[13px] font-bold text-emerald-600 block">MRP: ₹{item.original_selling}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 md:py-5 text-right font-bold text-brand-text text-[16px]">
                          ₹{(item.selling_price * item.quantity).toFixed(2)}
                        </td>
                        <td className="px-5 py-4 md:py-5 text-center">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-brand-danger hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="h-5 w-5" />
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
          <div className="glass-card rounded-2xl p-7 shadow-premium space-y-5">
            <h3 className="flex items-center gap-2 text-[20px] font-bold text-brand-text">
              <Receipt className="h-6 w-6 text-brand-accent" />
              Invoice Calculations
            </h3>

            {errorMessage && (
              <div className="rounded-xl bg-red-50 p-3.5 text-[15px] font-bold text-brand-danger border border-red-200">
                {errorMessage}
              </div>
            )}

            {/* Bill Details */}
            <div className="space-y-3.5 font-medium text-[16px] border-b border-brand-border pb-4">
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
                    className="rounded border-slate-300 text-brand-accent focus:ring-brand-accent h-4.5 w-4.5"
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
                  className="h-9 w-20 text-center text-[16px] font-bold rounded-lg border border-brand-border outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            {/* Breakdown Summaries */}
            <div className="space-y-3 font-medium text-[16px] border-b border-brand-border pb-4">
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
            <div className="flex items-baseline justify-between py-1">
              <span className="text-[18px] font-bold text-brand-text">Grand Total</span>
              <span className="text-[36px] font-bold text-brand-accent">₹{totalBillAmt.toFixed(2)}</span>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2.5">
              <span className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext">Payment Mode</span>
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
                      className={`flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl border font-bold text-[16px] transition-all ${
                        selected 
                           ? "bg-brand-light border-brand-primary/60 text-brand-accent shadow-inner" 
                          : "bg-white border-brand-border text-brand-subtext hover:bg-slate-50 hover:text-brand-text"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-accent py-4 text-[16px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 hover:shadow-lg disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
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
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl border border-brand-border animate-slide-up max-h-[90vh] flex flex-col justify-between">
            {/* Modal header options */}
            <div className="mb-4 flex items-center justify-between border-b border-brand-border pb-3">
              <div className="flex items-center gap-2 text-brand-accent">
                <Receipt className="h-6 w-6" />
                <h3 className="text-[20px] font-bold text-brand-text">Checkout Completed Successfully</h3>
              </div>
              <button onClick={handleCloseInvoice} className="text-slate-400 hover:text-slate-600">
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            {smsWarning && (
              <div className="mb-4 rounded-xl bg-amber-50 p-3 text-[14px] font-bold text-amber-700 border border-amber-200 flex items-start gap-2 no-print">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <span>Sale completed successfully. SMS notification could not be delivered.</span>
              </div>
            )}

            {/* Printable Invoice Area */}
            <div className="print-area flex-1 overflow-y-auto pr-1" style={{ position: "relative" }}>

              {/* Watermark Logo — rendered as real <img> so it appears in print/PDF */}
              <img
                src="/logo.jpeg"
                alt=""
                className="invoice-watermark"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: "70%",
                  maxWidth: "420px",
                  height: "auto",
                  objectFit: "contain",
                  opacity: 0.05,
                  zIndex: 0,
                  pointerEvents: "none"
                }}
              />

              {/* Invoice content sits above watermark */}
              <div style={{ position: "relative", zIndex: 1 }}>

                {/* Shop Header */}
                <div className="text-center pb-4 border-b border-dashed border-slate-200">
                  <h2 className="text-[20px] font-bold text-brand-text uppercase tracking-wide">{settings.shop_name}</h2>
                  <p className="text-[14px] text-brand-subtext font-semibold mt-1">{settings.shop_address}</p>
                  <p className="text-[14px] text-brand-subtext font-semibold">
                    Phone: {settings.shop_phone}
                    {invoiceData.applyGst && ` | GSTIN: ${localStorage.getItem("settings_shopGst") || "33AAAAA1234A1Z1"}`}
                  </p>
                </div>

                {/* Invoice Meta */}
                <div className="py-3.5 border-b border-slate-100 text-[14px] font-semibold text-brand-text grid grid-cols-2 gap-y-1">
                  <div>Invoice No: <span className="font-bold">{invoiceData.bill_no}</span></div>
                  <div className="text-right">Date: <span className="font-bold">{invoiceData.date.toLocaleString()}</span></div>
                  <div>Cashier: <span className="font-bold">Admin</span></div>
                  <div className="text-right">Payment: <span className="font-bold uppercase">{invoiceData.paymentMethod}</span></div>
                  <div className="col-span-2">Customer: <span className="font-bold">{invoiceData.customer_name || "Walk-in Customer"}</span></div>
                  {invoiceData.customer_phone && (
                    <div className="col-span-2">Mobile: <span className="font-bold">{invoiceData.customer_phone}</span></div>
                  )}
                </div>

                {/* Items List */}
                <table className="w-full text-left text-[14px] font-semibold mt-4">
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
                          <div className="font-bold">{item.brand} {item.type}</div>
                          <span className="text-[12px] text-brand-subtext font-semibold">
                            Size: {item.size} | Color: {item.color}
                          </span>
                        </td>
                        <td className="py-2 text-center">{item.quantity}</td>
                        <td className="py-2 text-right">₹{item.selling_price.toFixed(2)}</td>
                        <td className="py-2 text-right">₹{(item.selling_price * item.quantity).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Invoice Totals */}
                <div className="border-t border-dashed border-slate-200 mt-4 pt-3 text-[14px] font-semibold text-brand-text space-y-1.5 max-w-[220px] ml-auto">
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
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-[16px] font-bold">
                    <span className="text-brand-text">Grand Total:</span>
                    <span className="text-brand-accent">₹{invoiceData.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Invoice Bottom note */}
                <div className="text-center border-t border-dashed border-slate-200 mt-6 pt-4">
                  <p className="text-[14px] font-bold text-brand-text">Thank You for Shopping with Us!</p>
                  <p className="text-[12px] text-brand-subtext font-medium mt-0.5">Goods once sold cannot be returned. Only exchange within 7 days.</p>
                </div>

              </div>{/* end relative z-1 content */}
            </div>

            {/* Print Options */}
            <div className="mt-6 flex gap-3 border-t border-brand-border pt-4 no-print">
              <button
                onClick={handleCloseInvoice}
                className="flex-1 rounded-xl border border-brand-border bg-white py-3.5 text-[15px] font-bold text-brand-subtext hover:bg-slate-50 text-center"
              >
                Close Receipt
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-brand-accent py-3.5 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 text-center"
              >
                <Printer className="h-5 w-5" />
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