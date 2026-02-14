import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginScreen from "../features/auth/components/LoginScreen";
import AlertsPanel from "../features/wallboard/components/AlertsPanel";
import CapacityPanel from "../features/wallboard/components/CapacityPanel";
import DeadlinesPanel from "../features/wallboard/components/DeadlinesPanel";
import EventTicker from "../features/wallboard/components/EventTicker";
import FlowDeck from "../features/wallboard/components/FlowDeck";
import ForecastDeck from "../features/wallboard/components/ForecastDeck";
import HandoffDeck from "../features/wallboard/components/HandoffDeck";
import KpiCard from "../features/wallboard/components/KpiCard";
import OrderTrendPanel from "../features/wallboard/components/OrderTrendPanel";
import PipelinePanel from "../features/wallboard/components/PipelinePanel";
import RiskDeck from "../features/wallboard/components/RiskDeck";
import TeamDeck from "../features/wallboard/components/TeamDeck";
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
const DECK_ROTATE_INTERVAL_MS = 30 * 1000;
const RISK_DECK_INDEX = 1;

const DECKS = [
  { id: "overview", label: "Overview" },
  { id: "risk", label: "Risk Deck" },
  { id: "flow", label: "Flow Deck" },
  { id: "team", label: "Team Deck" },
  { id: "forecast", label: "SLA + Forecast" },
  { id: "handoff", label: "Handoff Snapshot" },
];

const App = () => {
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const hadCriticalAlertRef = useRef(false);
  const deckPaused = hoverPaused || manualPaused;

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
      setActiveDeckIndex(0);
      setHoverPaused(false);
      setManualPaused(false);
      hadCriticalAlertRef.current = false;
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

  const hasCriticalAlert = useMemo(
    () => Boolean((overview?.alerts || []).some((alert) => alert.severity === "critical")),
    [overview],
  );

  useEffect(() => {
    if (!user) return;

    if (hasCriticalAlert && !hadCriticalAlertRef.current) {
      setActiveDeckIndex(RISK_DECK_INDEX);
    }

    hadCriticalAlertRef.current = hasCriticalAlert;
  }, [hasCriticalAlert, user]);

  useEffect(() => {
    if (!user || deckPaused) return undefined;

    const timer = setInterval(() => {
      setActiveDeckIndex((previous) => (previous + 1) % DECKS.length);
    }, DECK_ROTATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [deckPaused, user]);

  const goToDeck = useCallback((index) => {
    const normalized = ((index % DECKS.length) + DECKS.length) % DECKS.length;
    setActiveDeckIndex(normalized);
  }, []);

  const goToNextDeck = useCallback(() => {
    goToDeck(activeDeckIndex + 1);
  }, [activeDeckIndex, goToDeck]);

  const goToPreviousDeck = useCallback(() => {
    goToDeck(activeDeckIndex - 1);
  }, [activeDeckIndex, goToDeck]);

  const activeDeck = DECKS[activeDeckIndex] || DECKS[0];
  const rotationStatusLabel = manualPaused
    ? "Rotation paused (manual)"
    : hoverPaused
      ? "Rotation paused (hover/focus)"
      : "Auto-swipe: 30s";

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
          <div className="status-row">
            <div className="status-pill">
              Last update: {formatTimestamp(overview?.generatedAt)}
            </div>
            <div className="status-pill">
              Deck {activeDeckIndex + 1}/{DECKS.length}: {activeDeck.label}
            </div>
            <div className="status-pill">
              {rotationStatusLabel}
            </div>
          </div>

          <div className="header-actions">
            <button onClick={() => refreshOverview()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button onClick={() => setManualPaused((previous) => !previous)}>
              {manualPaused ? "Resume Rotate" : "Pause Rotate"}
            </button>
            <button onClick={handleFullscreen}>Fullscreen</button>
            <button className="danger" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section
        className="deck-shell"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocusCapture={() => setHoverPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHoverPaused(false);
          }
        }}
      >
        <button
          type="button"
          className="deck-nav-button deck-nav-prev"
          aria-label="Previous deck"
          onClick={goToPreviousDeck}
        >
          {"<"}
        </button>
        <button
          type="button"
          className="deck-nav-button deck-nav-next"
          aria-label="Next deck"
          onClick={goToNextDeck}
        >
          {">"}
        </button>

        <div
          className="deck-track"
          style={{ transform: `translateX(-${activeDeckIndex * 100}%)` }}
        >
          <section className="deck-page deck-page-overview" aria-label="Overview">
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
          </section>

          <section className="deck-page deck-page-risk" aria-label="Risk Deck">
            <div className="deck-headline">
              <h2>Risk Deck</h2>
              <p>Escalation-focused view of critical alerts, urgent deadlines, and owner actions.</p>
            </div>
            <RiskDeck
              alerts={overview?.alerts}
              deadlines={overview?.deadlines}
              handoff={overview?.handoff}
            />
          </section>

          <section className="deck-page deck-page-flow" aria-label="Flow Deck">
            <div className="deck-headline">
              <h2>Flow Deck</h2>
              <p>Pipeline bottlenecks, aging, and stalled-stage visibility.</p>
            </div>
            <FlowDeck
              flow={overview?.flow}
              trend={overview?.orderTrend12h}
            />
          </section>

          <section className="deck-page deck-page-team" aria-label="Team Deck">
            <div className="deck-headline">
              <h2>Team Deck</h2>
              <p>Workload pressure, ownership gaps, and handoff readiness.</p>
            </div>
            <TeamDeck
              workload={overview?.workload}
              team={overview?.team}
              summary={summary}
            />
          </section>

          <section className="deck-page deck-page-forecast" aria-label="SLA + Forecast">
            <div className="deck-headline">
              <h2>SLA + Forecast</h2>
              <p>On-time performance and projected incoming load over the next 6 hours.</p>
            </div>
            <ForecastDeck forecast={overview?.forecast} />
          </section>

          <section className="deck-page deck-page-handoff" aria-label="Handoff Snapshot">
            <div className="deck-headline">
              <h2>Handoff Snapshot</h2>
              <p>Status changes in the last 30 minutes and immediate owner actions.</p>
            </div>
            <HandoffDeck handoff={overview?.handoff} />
          </section>
        </div>
      </section>

      <EventTicker events={overview?.events} />

      <div className="deck-pagination" role="tablist" aria-label="Wallboard decks">
        {DECKS.map((deck, index) => (
          <button
            key={deck.id}
            type="button"
            className={`deck-dot ${index === activeDeckIndex ? "active" : ""}`}
            onClick={() => goToDeck(index)}
            aria-label={`Open ${deck.label}`}
            aria-pressed={index === activeDeckIndex}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default App;
