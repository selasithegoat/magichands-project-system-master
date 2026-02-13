import { useState } from "react";

const LoginScreen = ({ loading, error, onSubmit }) => {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({ employeeId, password });
  };

  return (
    <div className="login-shell">
      <div className="login-panel">
        <p className="eyebrow">Operations Pulse Wall</p>
        <h1>Manager Kiosk Access</h1>
        <p className="subtext">
          Sign in with an admin account to run the live operational wallboard.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="employeeId">Employee ID</label>
          <input
            id="employeeId"
            type="text"
            autoComplete="username"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="Enter employee ID"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
          />

          {error ? <p className="error-banner">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Enter Wallboard"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginScreen;
