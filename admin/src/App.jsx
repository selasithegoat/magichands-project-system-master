import React, { useState, useEffect } from "react";
import Login from "./pages/Login/Login";
import AssignProject from "./pages/AssignProject/AssignProject";

function App() {
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
      setUser(null);
    }
  };

  return (
    <>
      {user ? <AssignProject /> : <Login onLoginSuccess={handleLoginSuccess} />}
    </>
  );
}

export default App;
