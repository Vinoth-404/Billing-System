import { useState, useEffect } from "react";
import { Save, Store, ShieldCheck, Upload, RefreshCcw, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Database, HardDrive, FolderOpen, Clock, AlertTriangle, X } from "lucide-react";
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

  // Data Backup fields
  const [backupStatus, setBackupStatus] = useState({
    backup_location: "",
    last_backup_time: "Never",
    last_backup_status: "Not Configured",
    last_backup_file: "",
    location_exists: false
  });
  const [backupAlert, setBackupAlert] = useState({ type: "", message: "" });
  const [backupLoading, setBackupLoading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [locationModalNotice, setLocationModalNotice] = useState("");
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFileContent, setRestoreFileContent] = useState("");
  const [restoreFileName, setRestoreFileName] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Password change toggle
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [alert, setAlert] = useState({ type: "", message: "" });
  const [passwordAlert, setPasswordAlert] = useState({ type: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const fetchBackupStatus = async () => {
    try {
      const res = await axios.get(`${API}/api/backup/status`);
      if (res.data) {
        setBackupStatus(res.data);
      }
    } catch (err) {
      console.error("[Backup] Failed to fetch backup status:", err);
    }
  };

  useEffect(() => {
    if (settings) {
      setShopName(settings.shop_name || "");
      setShopAddress(settings.shop_address || "");
      setShopPhone(settings.shop_phone || "");
      setLogoBase64(settings.shop_logo || "");
    }
    fetchBackupStatus();
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

  const handleBackupNow = async () => {
    setBackupAlert({ type: "", message: "" });

    if (!backupStatus.backup_location || !backupStatus.location_exists) {
      setLocationInput(backupStatus.backup_location || "");
      setLocationModalNotice("Please select a backup location before creating a backup.");
      setShowLocationModal(true);
      return;
    }

    setBackupLoading(true);

    try {
      const res = await axios.post(`${API}/api/backup/create`);
      setBackupAlert({
        type: "success",
        message: `${res.data.message} Saved in: ${res.data.backup_location}`
      });
      await fetchBackupStatus();
      await loadSettings();
    } catch (err) {
      setBackupAlert({
        type: "danger",
        message: err.response?.data?.error || "Failed to create database backup."
      });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locationInput || locationInput.trim() === "") {
      return;
    }

    try {
      await axios.post(`${API}/api/backup/set-location`, {
        backupLocation: locationInput
      });

      setShowLocationModal(false);
      setLocationModalNotice("");
      setBackupAlert({
        type: "success",
        message: "Backup location saved successfully!"
      });

      await fetchBackupStatus();
      await loadSettings();
    } catch (err) {
      setBackupAlert({
        type: "danger",
        message: err.response?.data?.error || "Failed to save backup location."
      });
    }
  };

  const handleFileSelectForRestore = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setRestoreFileContent(event.target.result);
        setRestoreFileName(file.name);
        setShowRestoreModal(true);
      };
      reader.readAsText(file);
    }
    // Clear input value so same file can be re-selected if needed
    e.target.value = "";
  };

  const handleConfirmRestore = async () => {
    setRestoreLoading(true);
    setBackupAlert({ type: "", message: "" });

    try {
      const res = await axios.post(`${API}/api/backup/restore`, {
        sqlContent: restoreFileContent
      });

      setShowRestoreModal(false);
      setRestoreFileContent("");
      setRestoreFileName("");

      setBackupAlert({
        type: "success",
        message: res.data.message || "Database restored successfully. Please restart the application if required."
      });

      await fetchBackupStatus();
      await loadSettings();
    } catch (err) {
      setShowRestoreModal(false);
      setBackupAlert({
        type: "danger",
        message: err.response?.data?.error || "Database restore failed."
      });
    } finally {
      setRestoreLoading(false);
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

        {/* Card 3: Data Backup & Restore */}
        <div className="glass-card rounded-2xl p-7 shadow-premium bg-white space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Database className="h-6 w-6 text-brand-accent" />
            <h3 className="text-[20px] font-bold text-brand-text">Data Backup</h3>
          </div>

          {backupAlert.message && (
            <div className={`rounded-xl p-4 text-[15px] font-bold border ${
              backupAlert.type === "success" 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-red-50 text-brand-danger border-red-200"
            }`}>
              {backupAlert.message}
            </div>
          )}

          {/* Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/70 p-5 rounded-xl border border-slate-200/60">
            <div>
              <span className="block text-[12px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Last Backup</span>
              <span className="text-[15px] font-extrabold text-brand-text flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                {backupStatus.last_backup_time || "Never"}
              </span>
            </div>

            <div className="md:col-span-1">
              <span className="block text-[12px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Backup Location</span>
              <span className="text-[14px] font-bold text-brand-text truncate block max-w-full" title={backupStatus.backup_location || "Not Configured"}>
                {backupStatus.backup_location ? backupStatus.backup_location : <span className="text-amber-600 font-semibold">Not Configured</span>}
              </span>
            </div>

            <div>
              <span className="block text-[12px] font-bold uppercase tracking-wider text-brand-subtext mb-1">Backup Status</span>
              <div>
                {backupStatus.location_exists ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {backupStatus.last_backup_status || "Ready"}
                  </span>
                ) : backupStatus.backup_location ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-brand-danger border border-red-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Folder Missing
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not Configured
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleBackupNow}
              disabled={backupLoading}
              className="flex items-center gap-2 rounded-xl bg-brand-accent px-6 py-3 text-[15px] font-bold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-blue-600 disabled:opacity-50"
            >
              {backupLoading ? <RefreshCcw className="h-4.5 w-4.5 animate-spin" /> : <HardDrive className="h-4.5 w-4.5" />}
              Backup Now
            </button>

            <button
              type="button"
              onClick={() => {
                setLocationInput(backupStatus.backup_location || "");
                setLocationModalNotice("");
                setShowLocationModal(true);
              }}
              className="flex items-center gap-2 rounded-xl border border-brand-border bg-white hover:bg-slate-50 px-5 py-3 text-[15px] font-bold text-brand-text transition-all"
            >
              <FolderOpen className="h-4.5 w-4.5 text-brand-accent" />
              Change Backup Location
            </button>

            <label className="flex items-center gap-2 rounded-xl border border-brand-border bg-white hover:bg-slate-50 px-5 py-3 text-[15px] font-bold text-brand-text cursor-pointer transition-all">
              <Upload className="h-4.5 w-4.5 text-brand-accent" />
              Restore Backup
              <input type="file" accept=".sql" onChange={handleFileSelectForRestore} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* MODAL 1: CHANGE / SELECT BACKUP LOCATION */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-premium space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-6 w-6 text-brand-accent" />
                <h3 className="text-[19px] font-bold text-brand-text">Select Backup Location</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {locationModalNotice && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-bold text-amber-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {locationModalNotice}
              </div>
            )}

            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-subtext mb-2">
                  PC Folder Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    placeholder="e.g. D:\SlipperShopBackups or C:\Backups"
                    className="h-11 flex-1 rounded-xl border border-brand-border bg-white px-4 text-sm font-semibold outline-none focus:border-brand-primary/60 focus:ring-2 focus:ring-brand-primary/10"
                    required
                    autoFocus
                  />
                  {"showDirectoryPicker" in window && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const handle = await window.showDirectoryPicker();
                          if (handle && handle.name) {
                            setLocationInput(`C:\\${handle.name}`);
                          }
                        } catch (err) {
                          // Picker cancelled or unsupported
                        }
                      }}
                      className="h-11 px-3.5 rounded-xl border border-brand-border bg-slate-50 hover:bg-slate-100 text-xs font-bold text-brand-text flex items-center gap-1.5"
                      title="Browse Folders"
                    >
                      <FolderOpen className="h-4 w-4 text-brand-accent" />
                      Browse
                    </button>
                  )}
                </div>
                <p className="text-[12px] font-medium text-brand-subtext mt-1.5">
                  Enter any valid directory path on your PC (e.g. D:\SlipperShopBackups).
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="rounded-xl border border-brand-border bg-white px-5 py-2.5 text-xs font-bold text-brand-subtext hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-accent px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-accent/20 hover:bg-blue-600"
                >
                  Save Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM RESTORE BACKUP */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-premium space-y-5 animate-scale-up border border-red-100">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-200">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[19px] font-extrabold text-brand-text">Confirm Database Restore</h3>
                <p className="text-xs font-semibold text-brand-subtext">Selected file: {restoreFileName}</p>
              </div>
            </div>

            <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm font-bold text-brand-danger space-y-1">
              <p>Restoring this backup will replace the current database data with the selected backup. Continue?</p>
            </div>

            <p className="text-xs font-medium text-slate-500">
              <strong className="text-slate-700">Safety Guarantee:</strong> An automatic safety backup of your current database will be saved to your backup folder before restoring.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreFileContent("");
                  setRestoreFileName("");
                }}
                disabled={restoreLoading}
                className="rounded-xl border border-brand-border bg-white px-5 py-2.5 text-xs font-bold text-brand-subtext hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={restoreLoading}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-red-600/20 hover:bg-red-700 disabled:opacity-50"
              >
                {restoreLoading && <RefreshCcw className="h-4 w-4 animate-spin" />}
                Confirm & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
