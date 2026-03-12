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
}) => (
  <div className="inventory-app">
    <Sidebar
      navItems={navItems}
      onLogout={onLogout}
      activeKey={activeKey}
      onNavigate={onNavigate}
    />
    <main className="main">
      <Topbar
        user={user}
        onQuickAction={onQuickAction}
        notificationCount={notificationCount}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
      {children}
    </main>
  </div>
);

export default InventoryLayout;
