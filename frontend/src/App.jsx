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
import { Lock, RefreshCw, Eye, EyeOff } from "lucide-react";
import axios from "axios";

import { useSettings } from "./context/SettingsContext";
const API = import.meta.env.VITE_API_URL;
function App() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem("isAuthenticated") === "true"
  );

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
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-subtext mb-2">Password</label>
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
              <Sidebar />

              {/* Main Panel */}
              <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/30">
                {/* Top Header */}
                <Header onLogout={handleLogout} />

                {/* Content Wrapper */}
                <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
                  <div className="mx-auto max-w-7xl">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/inventory" element={<Inventory />} />
                      <Route path="/add-stock" element={<AddStock />} />
                      <Route path="/billing" element={<Billing />} />
                      <Route path="/expenses" element={<Expenses />} />
                      <Route path="/history" element={<History />} />
                      <Route path="/reports" element={<Navigate to="/history" replace />} />
                      <Route path="/sales-history" element={<Navigate to="/history" replace />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/master-data" element={<MasterData />} />
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