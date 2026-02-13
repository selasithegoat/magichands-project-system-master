import { useCallback, useEffect, useMemo, useState } from "react";
import LoginScreen from "../features/auth/components/LoginScreen";
import AlertsPanel from "../features/wallboard/components/AlertsPanel";
import CapacityPanel from "../features/wallboard/components/CapacityPanel";
import DeadlinesPanel from "../features/wallboard/components/DeadlinesPanel";
import EventTicker from "../features/wallboard/components/EventTicker";
import KpiCard from "../features/wallboard/components/KpiCard";
import OrderTrendPanel from "../features/wallboard/components/OrderTrendPanel";
import PipelinePanel from "../features/wallboard/components/PipelinePanel";
import useRealtimeClient from "../hooks/useRealtimeClient";
import useRealtimeRefresh from "../hooks/useRealtimeRefresh";
import {
  getOpsWallboardSession,
  getOpsWallboardOverview,
  loginWithCredentials,
  logoutSession,
} from "../services/opsApi";
import { formatNumber, formatPercent, formatTimestamp } from "../utils/formatters";

const REFRESH_INTERVAL_MS = 30 * 1000;

const App = () => {
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const logout = useCallback(async () => {
    try {
      await logoutSession();
    } catch {
      // Local logout still applies if API logout fails.
    } finally {
      setUser(null);
      setOverview(null);
      setError("");
      setLoginError("");
    }
  }, []);

  const refreshOverview = useCallback(
    async ({ silent = false } = {}) => {
      if (!user) return;

      if (!silent) setLoading(true);
      try {
        const data = await getOpsWallboardOverview();
        setOverview(data);
        setError("");
      } catch (requestError) {
        if (requestError.status === 401 || requestError.status === 403) {
          await logout();
          return;
        }
        setError(requestError.message || "Failed to load wallboard overview.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [logout, user],
  );

  useEffect(() => {
    const checkSession = async () => {
      try {
        const session = await getOpsWallboardSession();
        if (session?.authenticated && session?.user?.role === "admin") {
          setUser(session.user);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    refreshOverview();
    const timer = setInterval(() => {
      refreshOverview({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refreshOverview, user]);

  useRealtimeClient(Boolean(user));
  useRealtimeRefresh(() => refreshOverview({ silent: true }), {
    enabled: Boolean(user),
    debounceMs: 550,
  });

  const handleLogin = async ({ employeeId, password }) => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const session = await loginWithCredentials({ employeeId, password });
      if (!session || session.role !== "admin") {
        await logoutSession();
        setLoginError("Only admin accounts can open this wallboard.");
        return;
      }
      setUser(session);
    } catch (requestError) {
      setLoginError(requestError.message || "Invalid login credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen can fail on unsupported environments.
    }
  };

  const summary = useMemo(() => overview?.summary || {}, [overview]);
  const kpiCards = useMemo(
    () => [
      {
        label: "New Orders (1h)",
        value: formatNumber(summary.newOrdersLastHour || 0),
        hint: "Fresh demand in the last hour",
        tone: "neutral",
      },
      {
        label: "New Orders (Today)",
        value: formatNumber(summary.newOrdersToday || 0),
        hint: "Orders created since midnight",
        tone: "neutral",
      },
      {
        label: "Deadlines <72h",
        value: formatNumber(summary.approachingDeadlines72h || 0),
        hint: "Projects entering high-focus delivery window",
        tone: summary.approachingDeadlines72h > 0 ? "warning" : "neutral",
      },
      {
        label: "Overdue",
        value: formatNumber(summary.overdueProjects || 0),
        hint: "Projects past delivery commitments",
        tone: summary.overdueProjects > 0 ? "critical" : "neutral",
      },
      {
        label: "Team Utilization",
        value: formatPercent(summary.teamUtilizationPercent || 0),
        hint: "Average weighted load across contributors",
        tone: summary.teamUtilizationPercent >= 100 ? "warning" : "positive",
      },
      {
        label: "Open Projects",
        value: formatNumber(summary.openProjects || 0),
        hint: "Active orders currently in operation",
        tone: "neutral",
      },
      {
        label: "Pending Approvals",
        value: formatNumber(summary.pendingApprovals || 0),
        hint: "Decision bottlenecks awaiting sign-off",
        tone: summary.pendingApprovals > 0 ? "warning" : "neutral",
      },
      {
        label: "Blocked / On Hold",
        value: formatNumber(summary.blockedProjects || 0),
        hint: "Projects paused due to blockers",
        tone: summary.blockedProjects > 0 ? "critical" : "neutral",
      },
    ],
    [summary],
  );

  if (authChecking) {
    return (
      <div className="loading-shell">
        <div className="loading-panel">Validating manager session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        loading={loginLoading}
        error={loginError}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="ops-wall">
      <div className="ambient-shape ambient-shape-a" />
      <div className="ambient-shape ambient-shape-b" />

      <header className="ops-header">
        <div>
          <p className="eyebrow">Operations Pulse Wall</p>
          <h1>Live Manager Overview</h1>
          <p className="subtext">
            Unified visibility into demand, delivery risk, team capacity, and
            live operational signals.
          </p>
        </div>

        <div className="header-right">
          <div className="status-pill">
            Last update: {formatTimestamp(overview?.generatedAt)}
          </div>
          <div className="header-actions">
            <button onClick={() => refreshOverview()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={handleFullscreen}>Fullscreen</button>
            <button className="danger" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="kpi-grid">
        {kpiCards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            tone={card.tone}
          />
        ))}
      </section>

      <section className="content-grid">
        <div className="panel-stack">
          <AlertsPanel alerts={overview?.alerts} />
          <PipelinePanel pipeline={overview?.pipeline} />
        </div>

        <DeadlinesPanel deadlines={overview?.deadlines} />

        <div className="panel-stack">
          <CapacityPanel
            workload={overview?.workload}
            teamUtilizationPercent={summary.teamUtilizationPercent}
          />
          <OrderTrendPanel trend={overview?.orderTrend12h} />
        </div>
      </section>

      <EventTicker events={overview?.events} />
    </div>
  );
};

export default App;
