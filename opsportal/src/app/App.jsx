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
const SWIPE_MIN_DISTANCE_PX = 52;
const SWIPE_DIRECTION_RATIO = 1.2;
const SWIPE_LOCK_DISTANCE_PX = 10;
const SWIPE_THRESHOLD_RATIO = 0.16;
const SWIPE_IGNORE_SELECTOR = "button, a, input, select, textarea, .table-wrap";

const DECKS = [
  { id: "overview", label: "Overview" },
  { id: "risk", label: "Risk Deck" },
  { id: "flow", label: "Flow Deck" },
  { id: "team", label: "Team Deck" },
  { id: "forecast", label: "SLA + Forecast" },
  { id: "handoff", label: "Handoff Snapshot" },
];
const LOOP_DECK_IDS = [DECKS[DECKS.length - 1].id, ...DECKS.map((deck) => deck.id), DECKS[0].id];

const isSwipeBlockedTarget = (target) =>
  typeof Element !== "undefined" &&
  target instanceof Element &&
  Boolean(target.closest(SWIPE_IGNORE_SELECTOR));

const App = () => {
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(1);
  const [pendingWrapDirection, setPendingWrapDirection] = useState(null);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [rotationRestartToken, setRotationRestartToken] = useState(0);
  const [touchPauseActive, setTouchPauseActive] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [disableDeckTransition, setDisableDeckTransition] = useState(false);
  const [touchDragOffsetPx, setTouchDragOffsetPx] = useState(0);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const hadCriticalAlertRef = useRef(false);
  const trackResetTimerRef = useRef(null);
  const deckShellRef = useRef(null);
  const swipeGestureRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    deltaX: 0,
    deltaY: 0,
    directionLocked: false,
    horizontalSwipe: false,
  });
  const deckPaused = hoverPaused || manualPaused || touchPauseActive || isTouchDragging;

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
      setTrackIndex(1);
      setPendingWrapDirection(null);
      setHoverPaused(false);
      setManualPaused(false);
      setTouchPauseActive(false);
      setTouchDragOffsetPx(0);
      setIsTouchDragging(false);
      hadCriticalAlertRef.current = false;
    }
  }, []);

  const handleLogoutClick = useCallback(() => {
    setShowLogoutDialog(true);
  }, []);

  const closeLogoutDialog = useCallback(() => {
    setShowLogoutDialog(false);
  }, []);

  const confirmLogout = useCallback(() => {
    setShowLogoutDialog(false);
    void logout();
  }, [logout]);

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

  useEffect(
    () => () => {
      if (trackResetTimerRef.current) {
        clearTimeout(trackResetTimerRef.current);
      }
    },
    [],
  );

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

  const restartRotationClock = useCallback(() => {
    setRotationRestartToken((previous) => previous + 1);
  }, []);

  const releaseTouchPause = useCallback(() => {
    setTouchPauseActive(false);
    setHoverPaused(false);
  }, []);

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
    if (!showLogoutDialog) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setShowLogoutDialog(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showLogoutDialog]);

  useEffect(() => {
    if (!touchPauseActive) return undefined;

    window.addEventListener("touchend", releaseTouchPause, { passive: true, capture: true });
    window.addEventListener("touchcancel", releaseTouchPause, { passive: true, capture: true });

    return () => {
      window.removeEventListener("touchend", releaseTouchPause, { capture: true });
      window.removeEventListener("touchcancel", releaseTouchPause, { capture: true });
    };
  }, [releaseTouchPause, touchPauseActive]);

  const commitTrackReset = useCallback((realIndex) => {
    if (trackResetTimerRef.current) {
      clearTimeout(trackResetTimerRef.current);
      trackResetTimerRef.current = null;
    }

    setDisableDeckTransition(true);
    setTrackIndex(realIndex + 1);

    // Keep transitions disabled long enough to guarantee the snap has painted.
    trackResetTimerRef.current = setTimeout(() => {
      setDisableDeckTransition(false);
      trackResetTimerRef.current = null;
    }, 40);
  }, []);

  const goToDeck = useCallback((index) => {
    const normalized = ((index % DECKS.length) + DECKS.length) % DECKS.length;
    if (pendingWrapDirection || normalized === activeDeckIndex) return;

    setTouchDragOffsetPx(0);
    setIsTouchDragging(false);

    const nextIndex = (activeDeckIndex + 1) % DECKS.length;
    const previousIndex = (activeDeckIndex - 1 + DECKS.length) % DECKS.length;
    const goingNext = normalized === nextIndex;
    const goingPrevious = normalized === previousIndex;

    if (goingNext) {
      setDisableDeckTransition(false);
      if (activeDeckIndex === DECKS.length - 1) {
        setPendingWrapDirection("next");
        setActiveDeckIndex(0);
        setTrackIndex(DECKS.length + 1);
        return;
      }

      setActiveDeckIndex(normalized);
      setTrackIndex(normalized + 1);
      return;
    }

    if (goingPrevious) {
      setDisableDeckTransition(false);
      if (activeDeckIndex === 0) {
        setPendingWrapDirection("previous");
        setActiveDeckIndex(DECKS.length - 1);
        setTrackIndex(0);
        return;
      }

      setActiveDeckIndex(normalized);
      setTrackIndex(normalized + 1);
      return;
    }

    setPendingWrapDirection(null);
    setActiveDeckIndex(normalized);
    commitTrackReset(normalized);
  }, [activeDeckIndex, commitTrackReset, pendingWrapDirection]);

  const goToNextDeck = useCallback(() => {
    goToDeck(activeDeckIndex + 1);
  }, [activeDeckIndex, goToDeck]);

  const goToPreviousDeck = useCallback(() => {
    goToDeck(activeDeckIndex - 1);
  }, [activeDeckIndex, goToDeck]);

  const handleDeckTrackTransitionEnd = useCallback((event) => {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "transform" ||
      !pendingWrapDirection
    ) {
      return;
    }

    if (pendingWrapDirection === "next") {
      setPendingWrapDirection(null);
      commitTrackReset(0);
      return;
    }

    setPendingWrapDirection(null);
    commitTrackReset(DECKS.length - 1);
  }, [commitTrackReset, pendingWrapDirection]);

  useEffect(() => {
    if (!user) return;

    if (hasCriticalAlert && !hadCriticalAlertRef.current) {
      goToDeck(RISK_DECK_INDEX);
    }

    hadCriticalAlertRef.current = hasCriticalAlert;
  }, [goToDeck, hasCriticalAlert, user]);

  useEffect(() => {
    if (!user || deckPaused) return undefined;

    const timer = setInterval(() => {
      goToDeck(activeDeckIndex + 1);
    }, DECK_ROTATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [activeDeckIndex, deckPaused, goToDeck, rotationRestartToken, user]);

  const handleDeckTouchStart = useCallback((event) => {
    setTouchPauseActive(true);

    if (
      event.touches.length !== 1 ||
      isSwipeBlockedTarget(event.target) ||
      showLogoutDialog ||
      pendingWrapDirection
    ) {
      swipeGestureRef.current.tracking = false;
      return;
    }

    const touch = event.touches[0];
    swipeGestureRef.current = {
      tracking: true,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaX: 0,
      deltaY: 0,
      directionLocked: false,
      horizontalSwipe: false,
    };
  }, [pendingWrapDirection, showLogoutDialog]);

  const handleDeckTouchMove = useCallback((event) => {
    const gesture = swipeGestureRef.current;
    if (!gesture.tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    gesture.deltaX = touch.clientX - gesture.startX;
    gesture.deltaY = touch.clientY - gesture.startY;

    if (!gesture.directionLocked) {
      const absX = Math.abs(gesture.deltaX);
      const absY = Math.abs(gesture.deltaY);
      if (absX < SWIPE_LOCK_DISTANCE_PX && absY < SWIPE_LOCK_DISTANCE_PX) {
        return;
      }

      gesture.directionLocked = true;
      gesture.horizontalSwipe = absX > absY * SWIPE_DIRECTION_RATIO;
      if (!gesture.horizontalSwipe) {
        gesture.tracking = false;
        setIsTouchDragging(false);
        setTouchDragOffsetPx(0);
        return;
      }
    }

    if (!gesture.horizontalSwipe) return;

    setIsTouchDragging(true);
    setTouchDragOffsetPx(gesture.deltaX);
    if (event.cancelable) {
      event.preventDefault();
    }
  }, []);

  const handleDeckTouchEnd = useCallback(
    (event) => {
      releaseTouchPause();

      const gesture = swipeGestureRef.current;
      if (!gesture.tracking) return;

      if (event.changedTouches.length === 1) {
        const touch = event.changedTouches[0];
        gesture.deltaX = touch.clientX - gesture.startX;
        gesture.deltaY = touch.clientY - gesture.startY;
      }

      const shellWidth = deckShellRef.current?.clientWidth || window.innerWidth || 0;
      const swipeThreshold = Math.max(
        SWIPE_MIN_DISTANCE_PX,
        Math.min(160, shellWidth * SWIPE_THRESHOLD_RATIO),
      );
      const absX = Math.abs(gesture.deltaX);
      const absY = Math.abs(gesture.deltaY);
      const canSwipe = gesture.horizontalSwipe && absX >= swipeThreshold
        && absX > absY * SWIPE_DIRECTION_RATIO;

      setIsTouchDragging(false);
      setTouchDragOffsetPx(0);

      if (canSwipe) {
        if (gesture.deltaX < 0) {
          goToNextDeck();
        } else {
          goToPreviousDeck();
        }
      }

      gesture.tracking = false;
      gesture.directionLocked = false;
      gesture.horizontalSwipe = false;
    },
    [goToNextDeck, goToPreviousDeck, releaseTouchPause],
  );

  const handleDeckTouchCancel = useCallback(() => {
    releaseTouchPause();
    swipeGestureRef.current.tracking = false;
    swipeGestureRef.current.directionLocked = false;
    swipeGestureRef.current.horizontalSwipe = false;
    setIsTouchDragging(false);
    setTouchDragOffsetPx(0);
  }, [releaseTouchPause]);

  const activeDeck = DECKS[activeDeckIndex] || DECKS[0];
  const deckTrackTransform = touchDragOffsetPx
    ? `translateX(calc(-${trackIndex * 100}% + ${touchDragOffsetPx}px))`
    : `translateX(-${trackIndex * 100}%)`;
  const rotationStatusLabel = manualPaused
    ? "Rotation paused (manual)"
    : touchPauseActive
      ? "Rotation paused (touch)"
    : hoverPaused
      ? "Rotation paused (hover/focus)"
      : "Auto-swipe: 30s";

  const renderDeckPage = useCallback((deckId, key, isClone = false) => {
    const cloneProps = isClone ? { "aria-hidden": true } : {};

    if (deckId === "overview") {
      return (
        <section key={key} className="deck-page deck-page-overview" aria-label="Overview" {...cloneProps}>
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
      );
    }

    if (deckId === "risk") {
      return (
        <section key={key} className="deck-page deck-page-risk" aria-label="Risk Deck" {...cloneProps}>
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
      );
    }

    if (deckId === "flow") {
      return (
        <section key={key} className="deck-page deck-page-flow" aria-label="Flow Deck" {...cloneProps}>
          <div className="deck-headline">
            <h2>Flow Deck</h2>
            <p>Pipeline bottlenecks, aging, and stalled-stage visibility.</p>
          </div>
          <FlowDeck
            flow={overview?.flow}
            trend={overview?.orderTrend12h}
          />
        </section>
      );
    }

    if (deckId === "team") {
      return (
        <section key={key} className="deck-page deck-page-team" aria-label="Team Deck" {...cloneProps}>
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
      );
    }

    if (deckId === "forecast") {
      return (
        <section key={key} className="deck-page deck-page-forecast" aria-label="SLA + Forecast" {...cloneProps}>
          <div className="deck-headline">
            <h2>SLA + Forecast</h2>
            <p>On-time performance and projected incoming load over the next 6 hours.</p>
          </div>
          <ForecastDeck forecast={overview?.forecast} />
        </section>
      );
    }

    if (deckId === "handoff") {
      return (
        <section key={key} className="deck-page deck-page-handoff" aria-label="Handoff Snapshot" {...cloneProps}>
          <div className="deck-headline">
            <h2>Handoff Snapshot</h2>
            <p>Status changes in the last 30 minutes and immediate owner actions.</p>
          </div>
          <HandoffDeck handoff={overview?.handoff} />
        </section>
      );
    }

    return null;
  }, [kpiCards, overview, summary]);

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
    <div
      className="ops-wall"
      onTouchStartCapture={restartRotationClock}
      onTouchEndCapture={releaseTouchPause}
      onTouchCancelCapture={releaseTouchPause}
    >
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
              <span className="btn-icon" aria-hidden="true">&#8635;</span>
              <span className="btn-label">{loading ? "Refreshing..." : "Refresh"}</span>
            </button>
            <button onClick={() => setManualPaused((previous) => !previous)}>
              <span className="btn-icon" aria-hidden="true">
                {manualPaused ? <>&#9654;</> : <>&#9208;</>}
              </span>
              <span className="btn-label">{manualPaused ? "Resume Rotate" : "Pause Rotate"}</span>
            </button>
            <button onClick={handleFullscreen}>
              <span className="btn-icon" aria-hidden="true">&#9974;</span>
              <span className="btn-label">Fullscreen</span>
            </button>
            <button className="danger" onClick={handleLogoutClick}>
              <span className="btn-icon" aria-hidden="true">&#8689;</span>
              <span className="btn-label">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <section
        ref={deckShellRef}
        className="deck-shell"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocusCapture={() => setHoverPaused(true)}
        onTouchStart={handleDeckTouchStart}
        onTouchMove={handleDeckTouchMove}
        onTouchEnd={handleDeckTouchEnd}
        onTouchCancel={handleDeckTouchCancel}
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
          <svg
            className="deck-nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9.70711 17.2929C10.0976 17.6834 10.0976 18.3166 9.70711 18.7071C9.31658 19.0976 8.68342 19.0976 8.29289 18.7071L2.29289 12.7071C1.90237 12.3166 1.90237 11.6834 2.29289 11.2929L8.29289 5.29289C8.68342 4.90237 9.31658 4.90237 9.70711 5.29289C10.0976 5.68342 10.0976 6.31658 9.70711 6.70711L5.41421 11L21 11C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13L5.41422 13L9.70711 17.2929Z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button
          type="button"
          className="deck-nav-button deck-nav-next"
          aria-label="Next deck"
          onClick={goToNextDeck}
        >
          <svg
            className="deck-nav-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M15.7071 5.29289C15.3166 4.90237 14.6834 4.90237 14.2929 5.29289C13.9024 5.68342 13.9024 6.31658 14.2929 6.70711L18.5858 11L3 11C2.44772 11 2 11.4477 2 12C2 12.5523 2.44772 13 3 13L18.5858 13L14.2929 17.2929C13.9024 17.6834 13.9024 18.3166 14.2929 18.7071C14.6834 19.0976 15.3166 19.0976 15.7071 18.7071L21.7071 12.7071C22.0976 12.3166 22.0976 11.6834 21.7071 11.2929L15.7071 5.29289Z"
              fill="currentColor"
            />
          </svg>
        </button>

        <div
          className={`deck-track${disableDeckTransition ? " deck-track-no-transform" : ""}${isTouchDragging ? " deck-track-dragging" : ""}`}
          onTransitionEnd={handleDeckTrackTransitionEnd}
          style={{
            transform: deckTrackTransform,
          }}
        >
          {LOOP_DECK_IDS.map((deckId, index) =>
            renderDeckPage(
              deckId,
              `deck-page-${deckId}-${index}`,
              index === 0 || index === LOOP_DECK_IDS.length - 1,
            ),
          )}
        </div>
      </section>

      <footer className="ops-footer">
        <EventTicker events={overview?.events} />
      </footer>

      {showLogoutDialog ? (
        <div className="dialog-overlay" onClick={closeLogoutDialog}>
          <div
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="logout-dialog-title">Confirm Logout</h2>
            <p>Are you sure you want to log out?</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-cancel"
                onClick={closeLogoutDialog}
                autoFocus
              >
                Cancel
              </button>
              <button type="button" className="danger" onClick={confirmLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;


