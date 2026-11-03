// NavbarComponent.jsx
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { Settings, ChevronRight, ChevronLeft, LogOut } from "lucide-react";
import { setCookie } from "../utils/cookieUtil";
import { debugCookieIssue } from "../utils/debugCookies";
import { motion, AnimatePresence } from "framer-motion";

// Import all icons
import {
  House,
  ShieldUser,
  Wallet,
  Database,
  FileText,
  Users,
  Package,
  CreditCard,
  BarChart,
  FileSpreadsheet,
  BookOpen,
  Calculator,
  Receipt,
  ClipboardCheck,
  FileCheck,
  Layers,
  PieChart,
  Calendar,
  FolderOpen,
  Briefcase,
  Building,
  Tag,
  BarChart2,
  TrendingUp,
  ClipboardList,
  FileBarChart,
  Book,
  ChevronsLeft,
  ChevronsRight,
  Bell,
} from "lucide-react";
import { Inventory, Dashboard, AccountBalance } from "@mui/icons-material";
import NotificationBell from "../modules/notification/NotificationBell";

// Comprehensive icon mapping
const ICON_MAP = {
  home: House,
  dashboard: Dashboard,
  admin: ShieldUser,
  accounting: AccountBalance,
  "master-control": Database,
  invoice: Receipt,
  purchaseorder: Package,
  journal: BookOpen,
  groups: Users,
  "trial-balance": Calculator,
  "profit-and-loss": TrendingUp,
  "balance-sheet": FileBarChart,
  "day-book": Calendar,
  "chart-of-accounts": Book,
  contra: Layers,
  clients: Users,
  vendor: Briefcase,
  hsn: Tag,
  settings: Settings,
  notification: Bell,
  notifications: Bell,
  default: FolderOpen,
};

export default function NavbarComponent() {
  const { user, logout, entities, hasPermission } = useAuth();
  const [choose, setChoose] = useState(user?.company?._id);
  const [openMenu, setOpenMenu] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigator = useNavigate();

  const toggleMenu = (name) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleChangeCompany = async (value) => {
    const selectedCompany = user?.companies?.find((c) => c._id === value);
    if (selectedCompany) {
      console.log("🔄 Switching company to:", selectedCompany.name, "ID:", value);
      
      try {
        // Step 1: Update localStorage
        localStorage.setItem("selectedCompany", JSON.stringify(selectedCompany));
        console.log("✅ localStorage updated:", selectedCompany.name);
        
        // Step 2: Set cookie with explicit options for production HTTPS
        setCookie("AC_CMP", value, {
          expires: 30,
          path: "/",
          domain: undefined, // Let browser use current domain
        });
        
        // Step 3: Verify cookie was set immediately
        setTimeout(() => {
          const cookieValue = document.cookie.split('; ').find(row => row.startsWith('AC_CMP='));
          console.log("✅ Cookie verification:", cookieValue || "Cookie NOT found");
          console.log("🍪 All cookies:", document.cookie);
        }, 50);
        
        // Step 4: Run debug check
        console.log("\n🔍 Running cookie debug check...");
        const debugInfo = debugCookieIssue();
        if (!debugInfo.hasCookie) {
          console.error("⚠️  CRITICAL: Cookie was not set! Company change will fail.");
        }
        
        // Step 5: Longer delay to ensure cookie is persisted in all scenarios
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Step 6: Update local state before reload
        setChoose(value);
        
        // Step 7: Reload to fetch new company data from backend
        console.log("🔄 Reloading page to apply company change...");
        window.location.reload();
      } catch (error) {
        console.error("❌ Error switching company:", error);
      }
    } else {
      console.error("❌ Company not found:", value);
    }
  };

  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    if (mainContent) {
      mainContent.style.marginLeft = isCollapsed ? "5rem" : "16rem";
    }
  }, [isCollapsed]);

  const hasViewPermission = (entityId) => {
    return hasPermission(undefined, "VIEW", { entityId });
  };

  const getIconComponent = (entity) => {
    const iconKey = entity.key?.toLowerCase().replace(/\s+/g, "-") || entity.name?.toLowerCase().replace(/\s+/g, "-");
    const IconComponent = ICON_MAP[iconKey] || ICON_MAP.default;
    return <IconComponent strokeWidth={1.5} size={20} className="transition-transform duration-200 group-hover:scale-110" />;
  };

  const buildNavigation = () => {
    const systemEntities = entities.filter((entity) => entity.system && !entity.parent);
    const navItems = entities.filter((entity) => entity.isNavItem && !entity.parent);
    const childEntities = entities.filter((entity) => entity.parent);

    const finalNavItems = [];
    const dashboardEntity = entities.find((e) => e.key === "DASHBOARD");
    if (dashboardEntity) {
      finalNavItems.push({ ...dashboardEntity, type: "standalone", alwaysShow: true });
    }

    systemEntities.forEach((systemEntity) => {
      const children = childEntities.filter((child) => child.parent?._id === systemEntity._id || child.parent === systemEntity._id);
      const allowedChildren = children.filter((child) => child.alwaysShow || hasViewPermission(child._id));

      if (allowedChildren.length > 0) {
        finalNavItems.push({ ...systemEntity, type: "dropdown", options: allowedChildren });
      } else if (hasViewPermission(systemEntity._id)) {
        finalNavItems.push({ ...systemEntity, type: "standalone" });
      }
    });

    navItems.forEach((item) => {
      if (item.key === "DASHBOARD") return;
      if (item.alwaysShow || hasViewPermission(item._id)) {
        finalNavItems.push({ ...item, type: "standalone" });
      }
    });

    return finalNavItems;
  };

  const links = buildNavigation();

  if (!user || !Array.isArray(entities)) {
    return (
      <div className={`fixed top-0 left-0 bottom-0 ${isCollapsed ? "w-20" : "w-64"} glass-dark z-50 flex items-center justify-center transition-all duration-500`}>
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 80 : 256 }}
      className="fixed top-0 left-0 bottom-0 flex flex-col overflow-hidden bg-[#0f172a] z-50 shadow-2xl transition-all duration-500 ease-in-out border-r border-white/5"
    >
      {/* Header */}
      <div className="p-4 mb-2 flex items-center justify-between">
        {!isCollapsed && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
              <img
                src="https://res.cloudinary.com/dxqzklc00/image/upload/v1738485494/Nexu_revised_logo_pm8f5r.png"
                alt="Logo"
                className="w-7 h-7 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm tracking-tight truncate w-32">
                {user?.company?.name || "Company"}
              </span>
              <span className="text-blue-400 text-[10px] font-semibold uppercase tracking-widest">
                Accounting
              </span>
            </div>
          </motion.div>
        )}
        {isCollapsed && (
             <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-600/20">
             <img
               src="https://res.cloudinary.com/dxqzklc00/image/upload/v1738485494/Nexu_revised_logo_pm8f5r.png"
               alt="Logo"
               className="w-7 h-7 object-contain"
             />
           </div>
        )}
      </div>

      {/* Company Selector */}
      {!isCollapsed && (
        <div className="px-4 mb-6">
          <div className="relative group">
            <select
              className="w-full appearance-none bg-white/5 border border-white/10 text-white text-xs py-2.5 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer hover:bg-white/10"
              value={choose}
              onChange={(e) => handleChangeCompany(e.target.value)}
            >
              {user?.companies?.length > 1 ? (
                user.companies.map((c, i) => (
                  <option key={i} value={c._id} className="bg-[#1e293b] text-white">
                    {c.name}
                  </option>
                ))
              ) : (
                <option value={user?.company?._id} className="bg-[#1e293b] text-white">
                  {user?.company?.name || "No Company"}
                </option>
              )}
            </select>
            <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      )}

   
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 space-y-1 custom-scrollbar">
        {links.map((link, index) => {
          if (!link.alwaysShow && !hasViewPermission(link._id)) return null;

          if (link.type === "dropdown") {
            const isOpen = openMenu === link.name;
            return (
              <div key={link._id || index} className="mb-1">
                <button
                  onClick={() => toggleMenu(link.name)}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${isOpen ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
                >
                  <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${isCollapsed ? "mx-auto" : ""} ${isOpen ? "bg-blue-600/20 text-blue-400" : "group-hover:bg-white/5"}`}>
                    {getIconComponent(link)}
                  </div>
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-sm font-medium text-left">{link.name}</span>
                      <ChevronRight size={14} className={`transition-transform duration-300 shrink-0 ${isOpen ? "rotate-90" : ""}`} />
                    </>
                  )}
                </button>
                <AnimatePresence>
                  {isOpen && !isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden ml-9 mt-1 border-l border-white/10"
                    >
                      {(link.name === "Accounting"
                        ? [
                            ...link.options.filter((option) => !(option.navLink === "/accounting/expense-audit" || option.key === "expense-audit")),
                            { _id: "accounting-expense-audit", name: "Expense Audit", navLink: "/accounting/expense-audit", key: "expense-audit", alwaysShow: true },
                            { _id: "accounting-master-data", name: "Accounting Master Data", navLink: "/accounting/master-data", key: "master-control", alwaysShow: true },
                            { _id: "accounting-hrms-payroll", name: "HRMS Payroll & Claims", navLink: "/accounting/hrms-payroll", key: "journal", alwaysShow: true },
                          ]
                        : link.options
                      ).map((child, idx) => (
                        <NavLink
                          key={child._id || idx}
                          to={child.navLink}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2 text-xs font-medium transition-all duration-200 rounded-r-xl ${isActive ? "text-blue-400 bg-blue-400/10" : "text-gray-400 hover:text-white hover:bg-white/5"}`
                          }
                        >
                          {getIconComponent(child)}
                          <span>{child.name}</span>
                        </NavLink>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }

          // Standalone item
          return (
            <NavLink
              key={link._id || link.key || index}
              to={
                link.navLink ||
                `/${link.key?.toLowerCase().replace(/\s+/g, "-")}`
              }
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 mb-1 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`
              }
              title={isCollapsed ? link.name : ""}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                  isCollapsed ? "mx-auto" : "group-hover:bg-white/5"
                }`}
              >
                {getIconComponent(link)}
              </div>
              {!isCollapsed && (
                <span className="text-sm font-medium flex-1">{link.name}</span>
              )}
            </NavLink>
          );
        })}


        {user?.role === "superAdmin" && (
          <div className="mb-1">
             <NavLink
          to="/reports/tax-flow"
          className={({ isActive }) =>
            `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 mb-1 ${
              isActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`
          }
          title={isCollapsed ? " Report Summary" : ""}
        >
          <div
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              isCollapsed ? "mx-auto" : "group-hover:bg-white/5"
            }`}
          >
            <BarChart2 strokeWidth={1.5} size={20} className="transition-transform duration-200 group-hover:scale-110" />
          </div>
          {!isCollapsed && (
            <span className="text-sm font-medium flex-1">Report Summary</span>
          )}
        </NavLink> 
             <NavLink
          to="/accounting/bank-reconciliation"
          className={({ isActive }) =>
            `group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 mb-1 ${
              isActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`
          }
          title={isCollapsed ? "Reconciliation" : ""}
        >
          <div
            className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              isCollapsed ? "mx-auto" : "group-hover:bg-white/5"
            }`}
          >
            <Receipt strokeWidth={1.5} size={20} className="transition-transform duration-200 group-hover:scale-110" />
          </div>
          {!isCollapsed && (
            <span className="text-sm font-medium flex-1">Reconciliation</span>
          )}
        </NavLink> 
            <button
              onClick={() => toggleMenu("Admin Settings")}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${openMenu === "Admin Settings" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"}`}
            >
              <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${openMenu === "Admin Settings" ? "bg-blue-600/20 text-blue-400" : "group-hover:bg-white/5"} ${isCollapsed ? "mx-auto" : ""}`}>
                <ShieldUser strokeWidth={1.5} size={20} className="transition-transform duration-200 group-hover:scale-110" />
              </div>
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-sm font-medium text-left">Admin Settings</span>
                  <ChevronRight size={14} className={`transition-transform duration-300 ${openMenu === "Admin Settings" ? "rotate-90" : ""}`} />
                </>
              )}
            </button>
            <AnimatePresence>
              {openMenu === "Admin Settings" && !isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden ml-9 mt-1 border-l border-white/10 flex flex-col"
                >
                  <NavLink
                    to="/user-management"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2 text-xs font-medium transition-all duration-200 rounded-r-xl ${isActive ? "text-blue-400 bg-blue-400/10" : "text-gray-400 hover:text-white hover:bg-white/5"}`
                    }
                  >
                    <Users strokeWidth={1.5} size={16} />
                    <span>User Management</span>
                  </NavLink>
                  <NavLink
                    to="/manageEntity"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2 text-xs font-medium transition-all duration-200 rounded-r-xl ${isActive ? "text-blue-400 bg-blue-400/10" : "text-gray-400 hover:text-white hover:bg-white/5"}`
                    }
                  >
                    <Database strokeWidth={1.5} size={16} />
                    <span>Access Management</span>
                  </NavLink>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

      </nav> 
      

{/* // Inside NavbarComponent, replace the entire <nav> block with this static version */}





      {/* Footer / User Profile */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 mb-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
        >
          {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>

          <div className={`flex ${isCollapsed ? "flex-col items-center" : "items-center justify-between"} gap-2`}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-600/20">
                  {user?.name?.charAt(0) || "U"}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0f172a] rounded-full shadow-sm"></div>
              </div>
              
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate" title={user?.name || "User"}>{user?.name || "User"}</p>
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-tighter truncate" title={user?.role || "Staff"}>{user?.role || "Staff"}</p>
                </div>
              )}
            </div>

            <div className={`flex ${isCollapsed ? "flex-col" : "items-center"} gap-0.5 shrink-0`}>
              <NotificationBell
                collapsed={true}
                isLink={true}
                buttonClassName="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-9 h-9 flex items-center justify-center"
                className="flex items-center"
              />
              <Link 
                to="/settings" 
                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors w-9 h-9 flex items-center justify-center"
                title="Settings"
              >
                <Settings size={18} />
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
  );
}
