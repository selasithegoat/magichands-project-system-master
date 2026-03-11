import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import "./InventoryLayout.css";

const InventoryLayout = ({
  navItems,
  user,
  onLogout,
  onQuickAction,
  notificationCount,
  children,
}) => (
  <div className="inventory-app">
    <Sidebar navItems={navItems} onLogout={onLogout} />
    <main className="main">
      <Topbar
        user={user}
        onQuickAction={onQuickAction}
        notificationCount={notificationCount}
      />
      {children}
    </main>
  </div>
);

export default InventoryLayout;
