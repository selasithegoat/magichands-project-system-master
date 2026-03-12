import AlertBanner from "../../components/ui/AlertBanner";
import "./Login.css";

const Login = ({
  appName,
  onSubmit,
  error,
  accessDenied,
}) => (
  <div className="login-shell">
    <div className="login-card">
      <div className="login-brand">
        <img src="/icon-192.png" alt="MagicHands Logo" />
        <div>
          <h1>{appName}</h1>
          <p>Enterprise Inventory Portal</p>
        </div>
      </div>

      {accessDenied ? (
        <AlertBanner
          variant="warning"
          title="Access restricted"
          description="Only Admin, Front Desk, and Stores users can access the inventory portal."
        />
      ) : null}

      <form className="login-form" onSubmit={onSubmit}>
        <label>
          Employee ID
          <input name="employeeId" type="text" placeholder="Enter employee ID" />
        </label>
        <label>
          Password
          <input name="password" type="password" placeholder="Enter password" />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button type="submit" className="primary-button">
          Sign in
        </button>
      </form>
      <div className="login-footer">
        <span>Need access?</span>
        <button type="button" className="ghost-button">
          Contact admin
        </button>
      </div>
    </div>
  </div>
);

export default Login;
