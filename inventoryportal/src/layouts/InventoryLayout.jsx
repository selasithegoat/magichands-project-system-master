import { useEffect, useState } from "react";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ToastStack from "../components/ui/ToastStack";
import "./InventoryLayout.css";

const InventoryLayout = ({
  navItems,
  user,
  onLogout,
  onQuickAction,
  notificationCount,
  onToggleNotification,
  isNotificationOpen,
  notificationDropdown,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  activeKey,
  onNavigate,
  theme,
  onToggleTheme,
  children,
}) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);

  const handleLogoutRequest = () => setIsLogoutOpen(true);
  const handleLogoutClose = () => setIsLogoutOpen(false);
  const handleLogoutConfirm = () => {
    setIsLogoutOpen(false);
    onLogout?.();
  };

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
        onLogout={handleLogoutRequest}
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
          onToggleNotification={onToggleNotification}
          isNotificationOpen={isNotificationOpen}
          notificationDropdown={notificationDropdown}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onMenuClick={() => setIsMobileNavOpen((prev) => !prev)}
        />
        {children}
        <ToastStack />
      </main>
      <ConfirmDialog
        isOpen={isLogoutOpen}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmText="Sign out"
        cancelText="Cancel"
        onConfirm={handleLogoutConfirm}
        onClose={handleLogoutClose}
        variant="center"
      />
    </div>
  );
};

export default InventoryLayout;
