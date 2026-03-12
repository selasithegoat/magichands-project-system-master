import { useEffect, useState } from "react";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import "./InventoryLayout.css";

const InventoryLayout = ({
  navItems,
  user,
  onLogout,
  onQuickAction,
  notificationCount,
  activeKey,
  onNavigate,
  theme,
  onToggleTheme,
  children,
}) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.style.overflow = isMobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileNavOpen]);

  return (
    <div className="inventory-app">
      <div
        className={`sidebar-backdrop ${isMobileNavOpen ? "open" : ""}`}
        role="presentation"
        onClick={() => setIsMobileNavOpen(false)}
      />
      <Sidebar
        navItems={navItems}
        onLogout={onLogout}
        activeKey={activeKey}
        onNavigate={onNavigate}
        isMobileOpen={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        user={user}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      <main className="main">
        <Topbar
          user={user}
          onQuickAction={onQuickAction}
          notificationCount={notificationCount}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onMenuClick={() => setIsMobileNavOpen((prev) => !prev)}
        />
        {children}
      </main>
    </div>
  );
};

export default InventoryLayout;
