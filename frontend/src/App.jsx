import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import AddStock from "./pages/AddStock";
import Billing from "./pages/Billing";
import History from "./pages/History";
import Settings from "./pages/Settings";
import MasterData from "./pages/MasterData";
import Expenses from "./pages/Expenses";
import BarcodeCenter from "./pages/BarcodeCenter";
import CustomerHistory from "./pages/CustomerHistory";
import PurchaseHistory from "./pages/PurchaseHistory";
import ErrorBoundary from "./components/ErrorBoundary";
import { Lock, RefreshCw, Eye, EyeOff, KeyRound, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import axios from "axios";

import { useSettings } from "./context/SettingsContext";
const API = import.meta.env.VITE_API_URL;
function App() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem("isAuthenticated") === "true"
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const authStatus = localStorage.getItem("isAuthenticated");
    if (authStatus !== "true") {
      setIsAuthenticated(false);
      navigate("/login");
    }
  }, [navigate]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password flow states
  const [forgotMode, setForgotMode] = useState(null); // null | 'unconfigured' | 'verifyPin' | 'resetPassword' | 'success'
  const [recoveryPinInput, setRecoveryPinInput] = useState("");
  const [showRecoveryPinInput, setShowRecoveryPinInput] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [showNewPasswordInput, setShowNewPasswordInput] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    axios
      .post(`${API}/api/settings/verify-password`, { password })
      .then((res) => {
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify({ username: "admin" }));
        localStorage.setItem("token", "session-token-12345");
        setIsAuthenticated(true);
        setLoading(false);
        navigate("/");
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Incorrect password");
        setLoading(false);
      });
  };

  const handleLogout = () => {
    console.log("Authentication cleared");
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    // Clear all other potential auth keys
    localStorage.removeItem("isLoggedIn");
    sessionStorage.removeItem("isLoggedIn");
    
    setIsAuthenticated(false);
    console.log("Redirecting to login");
    alert("Logged out successfully");
    navigate("/login");
  };

  const handleStartForgot = () => {
    setError("");
    setForgotError("");
    setForgotSuccess("");
    setRecoveryPinInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");

    if (!settings.has_recovery_pin) {
      setForgotMode("unconfigured");
    } else {
      setForgotMode("verifyPin");
    }
  };

  const handleVerifyPinSubmit = (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);

    if (!recoveryPinInput || !/^\d{6}$/.test(recoveryPinInput)) {
      setForgotError("Recovery PIN must be exactly 6 digits (numbers only).");
      setForgotLoading(false);
      return;
    }

    axios
      .post(`${API}/api/settings/verify-recovery-pin`, { pin: recoveryPinInput })
      .then((res) => {
        setForgotLoading(false);
        if (res.data.success && res.data.resetToken) {
          setResetToken(res.data.resetToken);
          setForgotMode("resetPassword");
        } else {
          setForgotError(res.data.error || "Failed to verify Recovery PIN");
        }
      })
      .catch((err) => {
        setForgotLoading(false);
        setForgotError(err.response?.data?.error || "Failed to verify Recovery PIN");
      });
  };

  const handleResetPasswordSubmit = (e) => {
    e.preventDefault();
    setForgotError("");

    if (!newPasswordInput) {
      setForgotError("New password is required");
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setForgotError("New password and confirm password do not match");
      return;
    }

    setForgotLoading(true);

    axios
      .post(`${API}/api/settings/reset-password-pin`, {
        resetToken,
        newPassword: newPasswordInput,
        confirmPassword: confirmPasswordInput
      })
      .then((res) => {
        setForgotLoading(false);
        setForgotSuccess(res.data.message || "Password updated successfully. Please log in with your new password.");
        setForgotMode("success");
      })
      .catch((err) => {
        setForgotLoading(false);
        setForgotError(err.response?.data?.error || "Failed to reset password");
      });
  };

  const resetForgotState = () => {
    setForgotMode(null);
    setRecoveryPinInput("");
    setResetToken("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setForgotError("");
    setForgotSuccess("");
  };

  return (
    <Routes>
      {/* Public Login Route */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <div className="flex h-screen w-screen items-center justify-center bg-[#F8FAFC]">
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-premium space-y-6">
                
                {/* FORGOT PASSWORD: UNCONFIGURED VIEW */}
                {forgotMode === "unconfigured" && (
                  <div className="space-y-5 animate-slide-up">
                    <div className="text-center space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                        <AlertCircle className="h-6 w-6" />
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight text-brand-text">
                        Account Recovery Unavailable
                      </h2>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 text-center">
                      Recovery PIN is not configured. Please contact the administrator.
                    </div>

                    <button
                      type="button"
                      onClick={resetForgotState}
                      className="flex w-full h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-slate-50 text-xs font-bold text-brand-text hover:bg-slate-100 transition-all"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Login
                    </button>
                  </div>
                )}

                {/* FORGOT PASSWORD: STEP 1 - VERIFY PIN */}
                {forgotMode === "verifyPin" && (
                  <div className="space-y-5 animate-slide-up">
                    <div className="text-center space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-brand-accent">
                        <KeyRound className="h-6 w-6" />
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight text-brand-text">
                        Account Recovery
                      </h2>
                      <p className="text-xs font-semibold text-brand-subtext">Enter your 6-digit Recovery PIN to reset password</p>
                    </div>

                    {forgotError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-brand-danger">
                        {forgotError}
                      </div>
                    )}

                    <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Recovery PIN</label>
                        <div className="relative">
                          <input
                            type={showRecoveryPinInput ? "text" : "password"}
                            value={recoveryPinInput}
                            maxLength={6}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setRecoveryPinInput(val);
                            }}
                            placeholder="Enter 6-digit PIN"
                            className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 tracking-widest"
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowRecoveryPinInput(!showRecoveryPinInput)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showRecoveryPinInput ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                          </button>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all"
                      >
                        {forgotLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        Verify PIN
                      </button>
                      <button
                        type="button"
                        onClick={resetForgotState}
                        className="flex w-full h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-all"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Login
                      </button>
                    </form>
                  </div>
                )}

                {/* FORGOT PASSWORD: STEP 2 - RESET PASSWORD */}
                {forgotMode === "resetPassword" && (
                  <div className="space-y-5 animate-slide-up">
                    <div className="text-center space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-brand-accent">
                        <Lock className="h-6 w-6" />
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight text-brand-text">
                        Reset Admin Password
                      </h2>
                      <p className="text-xs font-semibold text-brand-subtext">Enter your new password below</p>
                    </div>

                    {forgotError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-brand-danger">
                        {forgotError}
                      </div>
                    )}

                    <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">New Password</label>
                        <div className="relative">
                          <input
                            type={showNewPasswordInput ? "text" : "password"}
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            placeholder="Enter new password"
                            className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPasswordInput(!showNewPasswordInput)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showNewPasswordInput ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Confirm New Password</label>
                        <div className="relative">
                          <input
                            type={showNewPasswordInput ? "text" : "password"}
                            value={confirmPasswordInput}
                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                            placeholder="Confirm new password"
                            className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPasswordInput(!showNewPasswordInput)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showNewPasswordInput ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all"
                      >
                        {forgotLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        Update Password
                      </button>
                      <button
                        type="button"
                        onClick={resetForgotState}
                        className="flex w-full h-11 items-center justify-center gap-2 rounded-xl border border-brand-border bg-white text-xs font-bold text-brand-subtext hover:bg-slate-50 transition-all"
                      >
                        Cancel
                      </button>
                    </form>
                  </div>
                )}

                {/* FORGOT PASSWORD: STEP 3 - SUCCESS */}
                {forgotMode === "success" && (
                  <div className="space-y-5 animate-slide-up">
                    <div className="text-center space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <h2 className="text-xl font-extrabold tracking-tight text-brand-text">
                        Password Reset Complete
                      </h2>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 text-center">
                      {forgotSuccess}
                    </div>

                    <button
                      type="button"
                      onClick={resetForgotState}
                      className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Return to Login
                    </button>
                  </div>
                )}

                {/* NORMAL LOGIN VIEW */}
                {!forgotMode && (
                  <>
                    <div className="text-center space-y-2">
                      {settings.shop_logo ? (
                        <div className="mx-auto h-16 w-16 overflow-hidden rounded-2xl bg-white border border-slate-100 flex items-center justify-center p-1 shadow-sm">
                          <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
                        </div>
                      ) : (
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-brand-accent">
                          <Lock className="h-6 w-6" />
                        </div>
                      )}
                      <h2 className="text-xl font-extrabold tracking-tight text-brand-text">
                        {settings.shop_name} Login
                      </h2>
                      <p className="text-xs font-semibold text-brand-subtext">Enter shop credentials to access the POS & Inventory manager</p>
                    </div>

                    {error && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-brand-danger animate-pulse">
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext">Password</label>
                          <button
                            type="button"
                            onClick={handleStartForgot}
                            className="text-[11px] font-bold text-brand-accent hover:underline"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                          </button>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-brand-accent text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600 transition-all"
                      >
                        {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        Access System
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )
        }
      />

      {/* Protected Layout Routes */}
      <Route
        path="/*"
        element={
          isAuthenticated ? (
            <div className="flex h-screen w-screen overflow-hidden bg-[#FFFFFF]">
              {/* Sidebar */}
              <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

              {/* Main Panel */}
              <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/30">
                {/* Top Header */}
                <Header onLogout={handleLogout} onMenuClick={() => setSidebarOpen(true)} />

                {/* Content Wrapper */}
                <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
                  <div className="mx-auto max-w-7xl">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/inventory" element={<ErrorBoundary><Inventory /></ErrorBoundary>} />
                      <Route path="/add-stock" element={<AddStock />} />
                      <Route path="/billing" element={<Billing />} />
                      <Route path="/customer-history" element={<CustomerHistory />} />
                      <Route path="/purchase-history" element={<PurchaseHistory />} />
                      <Route path="/expenses" element={<Expenses />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/reports" element={<Navigate to="/history" replace />} />
                      <Route path="/sales-history" element={<Navigate to="/history" replace />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/master-data" element={<MasterData />} />
                      <Route path="/barcode-center" element={<BarcodeCenter />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </div>
                </main>
              </div>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

export default App;