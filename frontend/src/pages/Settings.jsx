import { useState, useEffect } from "react";
import { Save, Store, ShieldCheck, Upload, RefreshCcw, Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { useSettings } from "../context/SettingsContext";
const API = import.meta.env.VITE_API_URL;
function Settings() {
  const { settings, loadSettings } = useSettings();

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [logoBase64, setLogoBase64] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Password change toggle
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [alert, setAlert] = useState({ type: "", message: "" });
  const [passwordAlert, setPasswordAlert] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setShopName(settings.shop_name || "");
      setShopAddress(settings.shop_address || "");
      setShopPhone(settings.shop_phone || "");
      setLogoBase64(settings.shop_logo || "");
    }
  }, [settings]);

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAlert({ type: "", message: "" });

    try {
      await axios.post(`${API}/api/settings`, {
        shop_name: shopName,
        shop_address: shopAddress,
        shop_phone: shopPhone,
        shop_logo: logoBase64
      });

      await loadSettings();

      setAlert({
        type: "success",
        message: "Store information saved successfully!"
      });
    } catch (err) {
      console.error(err);
      setAlert({
        type: "danger",
        message: "Failed to save settings."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoRemove = () => {
    setLogoBase64("");
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordAlert({ type: "", message: "" });

    if (newPassword !== confirmPassword) {
      setPasswordAlert({
        type: "danger",
        message: "New password and confirm password do not match!"
      });
      return;
    }

    setPasswordLoading(true);

    try {
      await axios.post(`${API}/api/settings/change-password`, {
        currentPassword,
        newPassword
      });

      setPasswordAlert({
        type: "success",
        message: "Password changed successfully! Logging out in 1.5 seconds..."
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsChangingPassword(false);

      setTimeout(() => {
        localStorage.removeItem("isAuthenticated");
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        window.location.reload();
      }, 1500);
    } catch (err) {
      setPasswordAlert({
        type: "danger",
        message: err.response?.data?.error || "Failed to update password."
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-brand-text md:text-3xl">System Settings</h1>
        <p className="text-sm font-semibold text-brand-subtext mt-1">Configure shop contact details, receipt layout, and administration passwords</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Card 1: Store Information */}
        <div className="glass-card rounded-2xl p-6 shadow-premium bg-white space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="h-5 w-5 text-brand-accent" />
            <h3 className="text-sm font-extrabold text-brand-text">Store Information</h3>
          </div>

          {alert.message && (
            <div className={`rounded-xl p-3 text-xs font-bold border ${
              alert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {alert.message}
            </div>
          )}

          <form onSubmit={handleSaveInfo} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Name
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. SoleFlow Footwear"
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Mobile Number
              </label>
              <input
                type="text"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Address
              </label>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="e.g. 123 Shoe Market St, T. Nagar, Chennai"
                rows="3"
                className="w-full rounded-xl border border-brand-border bg-white p-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Logo
              </label>
              <div className="flex items-center gap-4">
                {logoBase64 ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-brand-border bg-slate-50">
                    <img src={logoBase64} alt="Shop Logo" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      className="absolute right-0 top-0 rounded-bl-lg bg-red-500 p-1 text-white hover:bg-red-600 transition-colors"
                      title="Remove Logo"
                    >
                      <RefreshCcw className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brand-border bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
                    <Upload className="h-5 w-5" />
                    <span className="text-[9px] font-bold mt-1 uppercase">Upload</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                )}
                <span className="text-[10px] font-semibold text-brand-subtext">
                  Recommended: Square PNG format. Uploaded logo will appear on invoice headers and billing slips.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Store Information
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Account Security */}
        <div className="glass-card rounded-2xl p-6 shadow-premium bg-white space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-5 w-5 text-brand-accent" />
            <h3 className="text-sm font-extrabold text-brand-text">Account Security</h3>
          </div>

          {passwordAlert.message && (
            <div className={`rounded-xl p-3 text-xs font-bold border ${
              passwordAlert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {passwordAlert.message}
            </div>
          )}

          {!isChangingPassword ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsChangingPassword(true)}
                className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600"
              >
                <ShieldCheck className="h-4 w-4" />
                Change Password
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4 animate-slide-up">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
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

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
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

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-11 w-full rounded-xl border border-brand-border bg-white pl-4 pr-10 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
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

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordAlert({ type: "", message: "" });
                  }}
                  className="rounded-xl border border-brand-border bg-white hover:bg-slate-50 px-5 py-2.5 text-xs font-bold text-brand-subtext transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
                >
                  {passwordLoading ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Save Password
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Settings;
