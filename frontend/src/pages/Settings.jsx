import { useState, useEffect } from "react";
import { Save, Store, ShieldCheck, Upload, RefreshCcw, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
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

  // Recovery PIN fields
  const [pinCurrentPassword, setPinCurrentPassword] = useState("");
  const [recoveryPin, setRecoveryPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isConfiguringPin, setIsConfiguringPin] = useState(false);
  const [pinAlert, setPinAlert] = useState({ type: "", message: "" });
  const [pinLoading, setPinLoading] = useState(false);

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
      console.error("[Settings] Save failed:", err.response?.data || err.message);
      setAlert({
        type: "danger",
        message: err.response?.data?.error || err.message || "Failed to save settings."
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

  const handleSaveRecoveryPin = async (e) => {
    e.preventDefault();
    setPinAlert({ type: "", message: "" });

    if (!pinCurrentPassword) {
      setPinAlert({ type: "danger", message: "Current Admin Password is required." });
      return;
    }

    if (!recoveryPin || !/^\d{6}$/.test(recoveryPin)) {
      setPinAlert({ type: "danger", message: "Recovery PIN must be exactly 6 digits (numbers only)." });
      return;
    }

    if (recoveryPin !== confirmPin) {
      setPinAlert({ type: "danger", message: "Recovery PIN and Confirm Recovery PIN do not match!" });
      return;
    }

    setPinLoading(true);

    try {
      await axios.post(`${API}/api/settings/recovery-pin`, {
        currentPassword: pinCurrentPassword,
        recoveryPin,
        confirmPin
      });

      await loadSettings();

      setPinAlert({
        type: "success",
        message: "Recovery PIN configured successfully!"
      });

      setPinCurrentPassword("");
      setRecoveryPin("");
      setConfirmPin("");
      setIsConfiguringPin(false);
    } catch (err) {
      setPinAlert({
        type: "danger",
        message: err.response?.data?.error || "Failed to save Recovery PIN."
      });
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Page Header */}
      <div>
        <h1 className="text-[44px] font-bold tracking-tight text-brand-text leading-tight">System Settings</h1>
        <p className="text-[18px] font-medium text-brand-subtext mt-1">Configure shop contact details, receipt layout, and administration passwords</p>
      </div>

      <div className="space-y-6 max-w-3xl">
        {/* Card 1: Store Information */}
        <div className="glass-card rounded-2xl p-7 shadow-premium bg-white space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="h-6 w-6 text-brand-accent" />
            <h3 className="text-[20px] font-bold text-brand-text">Store Information</h3>
          </div>

          {alert.message && (
            <div className={`rounded-xl p-4 text-[15px] font-bold border ${
              alert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {alert.message}
            </div>
          )}

          <form onSubmit={handleSaveInfo} className="space-y-5">
            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Name
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. SoleFlow Footwear"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Mobile Number
              </label>
              <input
                type="text"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="h-12 w-full rounded-xl border border-brand-border bg-white px-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Address
              </label>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="e.g. 123 Shoe Market St, T. Nagar, Chennai"
                rows="3"
                className="w-full rounded-xl border border-brand-border bg-white p-4 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                required
              />
            </div>

            <div>
              <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                Shop Logo
              </label>
              <div className="flex items-center gap-4">
                {logoBase64 ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-xl border border-brand-border bg-slate-50">
                    <img src={logoBase64} alt="Shop Logo" className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      className="absolute right-0 top-0 rounded-bl-lg bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors"
                      title="Remove Logo"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-brand-border bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all">
                    <Upload className="h-6 w-6" />
                    <span className="text-[11px] font-bold mt-1 uppercase">Upload</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                )}
                <span className="text-[14px] font-medium text-brand-subtext">
                  Recommended: Square PNG format. Uploaded logo will appear on invoice headers and billing slips.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCcw className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Save className="h-4.5 w-4.5" />
                )}
                Save Store Information
              </button>
            </div>
          </form>
        </div>

        {/* Card 2: Account Security */}
        <div className="glass-card rounded-2xl p-7 shadow-premium bg-white space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-6 w-6 text-brand-accent" />
            <h3 className="text-[20px] font-bold text-brand-text">Account Security</h3>
          </div>

          {passwordAlert.message && (
            <div className={`rounded-xl p-4 text-[15px] font-bold border ${
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
                className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600"
              >
                <ShieldCheck className="h-5 w-5" />
                Change Password
              </button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-5 animate-slide-up">
              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
                  className="rounded-xl border border-brand-border bg-white hover:bg-slate-50 px-5 py-3 text-[15px] font-bold text-brand-subtext transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
                >
                  {passwordLoading ? (
                    <RefreshCcw className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4.5 w-4.5" />
                  )}
                  Save Password
                </button>
              </div>
            </form>
          )}

          {/* Security / Account Recovery Section */}
          <div className="pt-6 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-brand-accent" />
                  <h4 className="text-[17px] font-bold text-brand-text">Security / Account Recovery</h4>
                </div>
                <p className="text-[14px] text-brand-subtext font-medium mt-1">
                  Configure a 6-digit Recovery PIN to securely reset your password if forgotten.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {settings.has_recovery_pin ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Recovery PIN Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not Configured
                  </span>
                )}
              </div>
            </div>

            {pinAlert.message && (
              <div className={`rounded-xl p-4 text-[15px] font-bold border ${
                pinAlert.type === "success" 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-red-50 text-brand-danger border-red-200"
              }`}>
                {pinAlert.message}
              </div>
            )}

            {!isConfiguringPin ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfiguringPin(true);
                    setPinAlert({ type: "", message: "" });
                  }}
                  className="flex items-center gap-2 rounded-xl border border-brand-border bg-slate-50 hover:bg-slate-100 px-5 py-2.5 text-[15px] font-bold text-brand-text transition-all"
                >
                  <KeyRound className="h-4.5 w-4.5 text-brand-accent" />
                  {settings.has_recovery_pin ? "Change Recovery PIN" : "Set Recovery PIN"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveRecoveryPin} className="space-y-5 animate-slide-up pt-2">
                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    Current Admin Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={pinCurrentPassword}
                      onChange={(e) => setPinCurrentPassword(e.target.value)}
                      placeholder="Enter current admin password"
                      className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    Recovery PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={recoveryPin}
                      maxLength={6}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setRecoveryPin(val);
                      }}
                      placeholder="Enter 6-digit PIN"
                      className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 tracking-widest"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="text-[12px] font-semibold text-brand-subtext mt-1">Must be exactly 6 numeric digits (0–9).</p>
                </div>

                <div>
                  <label className="block text-[15px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                    Confirm Recovery PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      value={confirmPin}
                      maxLength={6}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        setConfirmPin(val);
                      }}
                      placeholder="Re-enter 6-digit PIN"
                      className="h-12 w-full rounded-xl border border-brand-border bg-white pl-4 pr-11 text-[16px] placeholder:text-[15px] font-medium outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10 tracking-widest"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfiguringPin(false);
                      setPinCurrentPassword("");
                      setRecoveryPin("");
                      setConfirmPin("");
                      setPinAlert({ type: "", message: "" });
                    }}
                    className="rounded-xl border border-brand-border bg-white hover:bg-slate-50 px-5 py-3 text-[15px] font-bold text-brand-subtext transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pinLoading}
                    className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
                  >
                    {pinLoading ? (
                      <RefreshCcw className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-4.5 w-4.5" />
                    )}
                    {settings.has_recovery_pin ? "Change Recovery PIN" : "Save Recovery PIN"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
