import { useEffect, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Store as StoreIcon,
  Users,
  Wallet,
  User,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth";
import { useStores } from "../lib/store";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Layout() {
  const { t } = useTranslation();
  const { me, logout } = useAuth();
  const { stores, selectedId, setSelectedId, selectedName } = useStores();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-ink-50">
      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-sm animate-fadeIn"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={
          "fixed lg:static inset-y-0 left-0 z-40 w-64 shrink-0 bg-white border-r border-ink-200 " +
          "flex flex-col overflow-hidden isolate transition-transform duration-300 ease-out " +
          (open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        <SidebarChevrons />

        <div className="relative px-4 h-14 flex items-center gap-2.5 border-b border-ink-100">
          <img src="/icon.svg" alt="" className="w-8 h-8 rounded-md shadow-card" />
          <div className="leading-tight">
            <div className="font-display font-semibold text-[15px] tracking-tight">{t("nav.brand")}</div>
            <div className="text-[11px] text-ink-500">{t("nav.brandSub")}</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden ml-auto -mr-1 p-2 rounded-lg text-ink-500 hover:bg-ink-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Store switcher */}
        <div className="relative px-3 pt-3">
          <label className="label mb-1">{t("nav.viewing")}</label>
          <div className="relative">
            <StoreIcon className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              className="field pl-8 pr-8 appearance-none cursor-pointer font-medium"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
            >
              <option value="">{t("common.allStores")}</option>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store_id}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-ink-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <nav className="relative flex-1 p-2 pt-3 space-y-0.5 text-sm overflow-y-auto">
          <Item to="/" icon={<LayoutDashboard className="w-4 h-4" />} end>
            {t("nav.dashboard")}
          </Item>
          <Item to="/sales" icon={<Receipt className="w-4 h-4" />}>
            {t("nav.sales")}
          </Item>
          <Item to="/products" icon={<Package className="w-4 h-4" />}>
            {t("nav.products")}
          </Item>
          <Item to="/movements" icon={<History className="w-4 h-4" />}>
            {t("nav.movements")}
          </Item>
          <Item to="/clients" icon={<User className="w-4 h-4" />}>
            {t("nav.clients")}
          </Item>
          <Item to="/shifts" icon={<Wallet className="w-4 h-4" />}>
            {t("nav.shifts")}
          </Item>
          <div className="pt-2 mt-2 border-t border-ink-100 space-y-0.5">
            <div className="px-3 text-[10px] uppercase tracking-wider text-ink-400 pb-1">{t("nav.management")}</div>
            <Item to="/expenses" icon={<Wallet className="w-4 h-4" />}>
              {t("nav.expenses")}
            </Item>
            <Item to="/staff" icon={<Users className="w-4 h-4" />}>
              {t("nav.staff")}
            </Item>
          </div>
        </nav>

        <div className="relative p-2 border-t border-ink-100">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-white grid place-items-center text-xs font-semibold shrink-0">
              {initials(me?.name || me?.email || "?")}
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-sm font-medium truncate">{me?.name || t("nav.owner")}</div>
              <div className="text-[11px] text-ink-500 truncate">{me?.email}</div>
            </div>
            <LanguageSwitcher />
          </div>
          <button onClick={logout} className="w-full mt-1 btn-ghost justify-start text-ink-600 hover:text-ink-900">
            <LogOut className="w-4 h-4" />
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 h-14 border-b border-ink-200 bg-white/80 backdrop-blur flex items-center gap-2 px-3 sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden -ml-1 p-2 rounded-lg text-ink-600 hover:bg-ink-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <BarChart3 className="w-4 h-4 text-accent-600 shrink-0" />
          <span className="text-sm text-ink-500 hidden sm:inline">{t("nav.consolidatedView")}</span>
          <span className="text-sm font-medium truncate">{selectedName}</span>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="max-w-6xl mx-auto animate-fadeIn">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function Item({ to, icon, children, end }: { to: string; icon: React.ReactNode; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        "relative flex items-center gap-2.5 pl-3 pr-2.5 py-2 rounded-lg transition-all " +
        (isActive
          ? "bg-gradient-to-r from-ink-900 to-ink-800 text-white font-medium shadow-sm"
          : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900")
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-1 h-5 rounded-full bg-accent-500" />
          )}
          <span className={isActive ? "text-white" : ""}>{icon}</span>
          <span>{children}</span>
        </>
      )}
    </NavLink>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SidebarChevrons() {
  const chevrons: React.ReactNode[] = [];
  for (let i = 0; i < 9; i++) {
    const size = 36 + i * 22;
    chevrons.push(
      <path
        key={i}
        d={`M ${-size} ${size} L 0 0 L ${size} ${size}`}
        stroke="rgb(79, 70, 229)"
        strokeWidth={i % 3 === 0 ? 1.2 : 0.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.05 + i * 0.012}
      />,
    );
  }
  return (
    <svg
      aria-hidden
      className="absolute bottom-0 right-0 w-[240px] h-[240px] pointer-events-none -z-10"
      viewBox="0 0 240 240"
      preserveAspectRatio="xMaxYMax meet"
    >
      <g transform="translate(220 220)">{chevrons}</g>
    </svg>
  );
}
