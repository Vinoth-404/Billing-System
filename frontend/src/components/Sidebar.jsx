import { NavLink } from "react-router-dom";
const API = import.meta.env.VITE_API_URL;
import {
  LayoutDashboard,
  Boxes,
  Package,
  Receipt,
  History,
  BarChart3,
  Settings,
  Footprints,
  Database,
  Banknote
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";

function Sidebar() {
  const { settings } = useSettings();
  const menuItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Inventory Management", path: "/inventory", icon: Boxes },
    { name: "Add Stock", path: "/add-stock", icon: Package },
    { name: "Billing", path: "/billing", icon: Receipt },
    { name: "Expenses", path: "/expenses", icon: Banknote },
    { name: "History", path: "/history", icon: History },
    { name: "Master Data", path: "/master-data", icon: Database },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-brand-border bg-white p-5">
      {/* Brand Logo & Name */}
      <div className="mb-8 flex items-center gap-3 px-2 py-4">
        {settings.shop_logo ? (
          <div className="flex h-10 w-10 overflow-hidden items-center justify-center rounded-xl bg-white border border-slate-100 p-0.5 shadow-sm">
            <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-primary to-brand-accent text-white shadow-md shadow-brand-primary/20">
            <Footprints className="h-6 w-6" />
          </div>
        )}
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-brand-text leading-none">{settings.shop_name}</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">Slipper Shop Management</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 ${
                  isActive
                    ? "bg-brand-light text-brand-accent shadow-sm border-r-4 border-brand-accent"
                    : "text-brand-subtext hover:bg-brand-light/40 hover:text-brand-text"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Branding */}
      <div className="border-t border-brand-border pt-4 px-2 text-center">
        <p className="text-[10px] font-medium text-brand-subtext">SoleFlow ERP v1.0.0</p>
        <p className="text-[9px] text-brand-primary mt-0.5">© 2026 Slipper Shop Inc.</p>
      </div>
    </aside>
  );
}

export default Sidebar;