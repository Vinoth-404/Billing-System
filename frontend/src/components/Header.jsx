import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { 
  Bell, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  ShoppingBag, 
  PlusCircle,
  MessageSquare,
  ChevronDown,
  LogOut,
  Settings as SettingsIcon
} from "lucide-react";
import axios from "axios";

function Header({ onLogout }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);

  // Live Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch stored notifications from DB API
  const fetchNotifications = () => {
    axios
      .get("http://localhost:5000/api/notifications")
      .then((res) => {
        if (res.data) {
          setNotifications(res.data);
        }
      })
      .catch((err) => console.error("Error fetching notifications:", err));
  };

  useEffect(() => {
    fetchNotifications();

    const handleStockUpdate = () => {
      fetchNotifications();
    };

    window.addEventListener("stock-updated", handleStockUpdate);
    window.addEventListener("storage", handleStockUpdate);

    // Poll notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("stock-updated", handleStockUpdate);
      window.removeEventListener("storage", handleStockUpdate);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Badge count represents only active alerts (low stock + out of stock)
  const activeAlertsCount = notifications.filter(
    (n) => n.type === "low_stock" || n.type === "out_of_stock"
  ).length;

  // Format Date
  const formatDate = (date) => {
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  };

  // Format Time
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-brand-border bg-white/90 px-8 backdrop-blur-md">
      {/* Spacer */}
      <div></div>

      {/* Clock, Notifications & User */}
      <div className="flex items-center gap-6">
        {/* System Date & Time */}
        <div className="flex items-center gap-2 rounded-xl bg-brand-light px-4 py-1.5 text-sm font-medium text-brand-accent shadow-sm">
          <Clock className="h-4 w-4" />
          <span>{formatDate(currentTime)}</span>
          <span className="text-brand-primary/40">|</span>
          <span className="font-semibold">{formatTime(currentTime)}</span>
        </div>

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-white text-brand-text shadow-sm transition-all hover:bg-brand-light hover:text-brand-accent hover:border-brand-primary/30"
          >
            <Bell className="h-5 w-5" />
            {activeAlertsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-danger text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
                {activeAlertsCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-80 origin-top-right rounded-2xl border border-brand-border bg-white p-4 shadow-xl ring-1 ring-black/5 animate-slide-up z-50">
              <div className="mb-2 flex items-center justify-between border-b border-brand-border pb-2">
                <h3 className="font-semibold text-brand-text">Notification Center</h3>
                <span className="rounded bg-brand-light px-2 py-0.5 text-xs font-medium text-brand-accent">
                  {activeAlertsCount} active alert{activeAlertsCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center space-y-1">
                    <p className="text-xs font-bold text-emerald-600">✅ No inventory alerts</p>
                    <p className="text-[10px] text-brand-subtext font-semibold">All products are sufficiently stocked.</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    let iconBg = "bg-amber-50 text-brand-warning";
                    let Icon = AlertTriangle;
                    let title = "⚠️ Low Stock Alert";

                    if (notif.type === "out_of_stock") {
                      iconBg = "bg-red-50 text-brand-danger";
                      Icon = ShieldAlert;
                      title = "🚫 Out of Stock";
                    }

                    const isSMS = notif.recipient !== null && notif.recipient !== undefined;

                    return (
                      <div key={notif.id} className="flex gap-3 py-3 last:pb-0">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-brand-text">{title}</p>
                            {isSMS && (
                              <span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                                notif.status === "Sent" 
                                  ? "bg-emerald-100 text-emerald-800" 
                                  : "bg-red-100 text-red-800"
                              }`}>
                                {notif.status}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-brand-subtext mt-0.5 leading-relaxed whitespace-pre-line">
                            {notif.message}
                          </p>
                          {isSMS && (
                            <p className="text-[10px] text-brand-accent font-semibold mt-1">
                              To: {notif.recipient}
                            </p>
                          )}
                          <span className="text-[9px] text-slate-400 mt-1 block">
                            {new Date(notif.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{" "}
                            {new Date(notif.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 border-l border-brand-border pl-6 hover:opacity-80 transition-all outline-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-accent font-semibold shadow-inner">
              AD
            </div>
            <div className="hidden text-left md:block">
              <div className="flex items-center gap-1 font-semibold text-brand-text">
                <span className="text-xs leading-3">Admin User</span>
                <ChevronDown className="h-3.5 w-3.5 text-brand-subtext mt-0.5" />
              </div>
              <p className="text-[10px] text-brand-subtext font-medium mt-1">Slipper Shop Manager</p>
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-3 w-48 origin-top-right rounded-2xl border border-brand-border bg-white p-2 shadow-xl ring-1 ring-black/5 animate-slide-up z-50">
              <Link
                to="/settings"
                onClick={() => setShowProfileMenu(false)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-brand-subtext hover:bg-brand-light hover:text-brand-accent transition-all w-full text-left"
              >
                <SettingsIcon className="h-4 w-4 text-brand-accent" />
                <span>Settings</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  console.log("Logout button clicked");
                  setShowProfileMenu(false);
                  if (typeof onLogout === "function") {
                    onLogout();
                  }
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-brand-danger hover:bg-red-50 transition-all w-full text-left"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
