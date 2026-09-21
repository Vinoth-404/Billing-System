import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  Receipt,
  Wallet,
  History,
  ScanBarcode,
  Database,
  Settings,
  Footprints,
  UsersRound,
  ShoppingCart
} from "lucide-react";
import { useSettings } from "../context/SettingsContext";

const menuItems = [
  { name: "Dashboard",            path: "/",              icon: LayoutDashboard },
  { name: "Inventory Management", path: "/inventory",      icon: Boxes           },
  { name: "Add Stock",            path: "/add-stock",      icon: PackagePlus     },
  { name: "Billing (POS)",        path: "/billing",        icon: Receipt         },
  { name: "Customer History",     path: "/customer-history", icon: UsersRound    },
  { name: "Purchase History",     path: "/purchase-history", icon: ShoppingCart   },
  { name: "Expenses",             path: "/expenses",       icon: Wallet          },
  { name: "History",              path: "/history",        icon: History         },
  { name: "Barcode Center",       path: "/barcode-center", icon: ScanBarcode     },
  { name: "Master Data",          path: "/master-data",    icon: Database        },
  { name: "Settings",             path: "/settings",       icon: Settings        },
];

function Sidebar({ isOpen, onClose }) {
  const { settings } = useSettings();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] shrink-0 flex-col border-r border-brand-border bg-white shadow-xs transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >

        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3.5 px-6 pt-6 pb-5 border-b border-brand-border">
          {settings.shop_logo ? (
            <div className="flex h-11 w-11 shrink-0 overflow-hidden items-center justify-center rounded-xl bg-white border border-slate-100 p-1 shadow-sm">
              <img src={settings.shop_logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-primary to-brand-accent text-white shadow-md shadow-brand-primary/20">
              <Footprints className="h-6 w-6" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-brand-text leading-snug truncate">
              {settings.shop_name}
            </h2>
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-primary block mt-0.5">
              Slipper Shop ERP
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
          {menuItems.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={name}
              to={path}
              end={path === "/"}
              onClick={() => {
                if (onClose) onClose();
              }}
              className={({ isActive }) =>
                [
                  "group flex min-h-[56px] items-center gap-[14px] px-[18px] py-[14px] rounded-[12px] border-l-4",
                  "transition-all duration-200 ease-in-out select-none",
                  isActive
                    ? "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB] font-semibold"
                    : "border-transparent text-brand-subtext hover:bg-slate-100/80 hover:text-brand-text font-medium"
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="shrink-0"
                    style={{
                      width: 22,
                      height: 22,
                      strokeWidth: 2,
                      color: isActive ? "#2563EB" : "#64748B",
                      transition: "color 200ms ease-in-out"
                    }}
                  />
                  <span
                    className="truncate text-[15px] font-medium leading-[22px]"
                    style={{
                      color: isActive ? "#2563EB" : undefined,
                      transition: "color 200ms ease-in-out"
                    }}
                  >
                    {name}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer Branding */}
        <div className="mt-auto border-t border-brand-border px-6 py-5 text-center">
          <p className="text-xs font-semibold text-brand-subtext">SoleFlow ERP v1.0.0</p>
          <p className="text-[11px] font-medium text-brand-primary mt-1">© 2026 Slipper Shop Inc.</p>
        </div>

      </aside>
    </>
  );
}

export default Sidebar;