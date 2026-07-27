import { useMemo, useState } from "react";
import AlertsPanel from "../features/wallboard/components/AlertsPanel";
import CapacityPanel from "../features/wallboard/components/CapacityPanel";
import DeadlinesPanel from "../features/wallboard/components/DeadlinesPanel";
import FlowDeck from "../features/wallboard/components/FlowDeck";
import ForecastDeck from "../features/wallboard/components/ForecastDeck";
import HandoffDeck from "../features/wallboard/components/HandoffDeck";
import OrderTrendPanel from "../features/wallboard/components/OrderTrendPanel";
import PipelinePanel from "../features/wallboard/components/PipelinePanel";
import RiskDeck from "../features/wallboard/components/RiskDeck";
import TeamDeck from "../features/wallboard/components/TeamDeck";
import { formatNumber, formatPercent, formatTimestamp } from "../utils/formatters";
import "./CommandCenter.css";

const NAV_ITEMS = [
  { id: "command", label: "Command Center", icon: "grid" },
  { id: "risks", label: "Risks & Alerts", icon: "alert" },
  { id: "flow", label: "Production Flow", icon: "flow" },
  { id: "capacity", label: "Team Capacity", icon: "team" },
  { id: "deadlines", label: "Deadlines & SLA", icon: "clock" },
  { id: "handoffs", label: "Handoffs", icon: "handoff" },
];

const Icon = ({ name }) => {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    alert: <><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    flow: <><path d="M4 6h11" /><path d="m12 3 3 3-3 3" /><path d="M20 18H9" /><path d="m12 15-3 3 3 3" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.3a3 3 0 0 1 0 5.4" /><path d="M18 14.5a6 6 0 0 1 3 5.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    handoff: <><path d="M7 7h13" /><path d="m16 3 4 4-4 4" /><path d="M17 17H4" /><path d="m8 13-4 4 4 4" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
    refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18 9a7 7 0 0 0-12-2L4 11" /><path d="M6 15a7 7 0 0 0 12 2l2-4" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
  };
  return (
    <svg className="cc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const PAGE_META = {
  command: ["Operations Command Center", "A live view of delivery risk, workload and the actions that need attention now."],
  risks: ["Risks & Alerts", "Escalations, blocked work and operational issues ranked by urgency."],
  flow: ["Production Flow", "Pipeline health, stalled stages and movement across the operation."],
  capacity: ["Team Capacity", "Current workload pressure, ownership gaps and team readiness."],
  deadlines: ["Deadlines & SLA", "Delivery commitments, overdue work and near-term forecast."],
  handoffs: ["Handoffs", "Recent transitions, pending acknowledgements and next-owner actions."],
};

const Metric = ({ label, value, tone, detail }) => (
  <article className={`cc-metric cc-tone-${tone || "default"}`}>
    <span className="cc-metric-label">{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </article>
);

const PriorityQueue = ({ alerts = [], deadlines = [] }) => {
  const actions = useMemo(() => {
    const alertActions = alerts.map((alert, index) => ({
      id: `alert-${alert.id || index}`,
      severity: alert.severity || "medium",
      title: alert.title || "Operational alert",
      message: alert.message || "Review this issue.",
      meta: "Operational alert",
    }));
    const deadlineActions = deadlines
      .filter((item) => Number(item.hoursRemaining) <= 72)
      .map((item, index) => ({
        id: `deadline-${item.id || index}`,
        severity: Number(item.hoursRemaining) < 0 ? "critical" : Number(item.hoursRemaining) <= 24 ? "high" : "medium",
        title: item.projectName || item.orderId || "Upcoming deadline",
        message: `${item.status || "Active"} · ${item.lead || "No lead assigned"}`,
        meta: Number(item.hoursRemaining) < 0
          ? `${Math.abs(Math.round(item.hoursRemaining))}h overdue`
          : `${Math.round(item.hoursRemaining)}h remaining`,
      }));
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...alertActions, ...deadlineActions]
      .sort((a, b) => (rank[a.severity] ?? 4) - (rank[b.severity] ?? 4))
      .slice(0, 7);
  }, [alerts, deadlines]);

  return (
    <article className="cc-card cc-priority">
      <div className="cc-card-head">
        <div>
          <span className="cc-kicker">Immediate focus</span>
          <h2>Priority action queue</h2>
        </div>
        <span className="cc-count">{actions.length} active</span>
      </div>
      <div className="cc-action-list">
        {actions.length ? actions.map((action, index) => (
          <div className="cc-action" key={action.id}>
            <span className={`cc-severity cc-severity-${action.severity}`} />
            <span className="cc-action-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="cc-action-copy">
              <strong>{action.title}</strong>
              <span>{action.message}</span>
            </div>
            <span className="cc-action-meta">{action.meta}</span>
          </div>
        )) : <div className="cc-empty">No immediate operational actions. The floor is looking healthy.</div>}
      </div>
    </article>
  );
};

const CommandCenter = ({
  overview,
  loading,
  error,
  user,
  onRefresh,
  onLogout,
  onOpenWallboard,
}) => {
  const [activePage, setActivePage] = useState("command");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const summary = overview?.summary || {};
  const [title, subtitle] = PAGE_META[activePage];

  const selectPage = (page) => {
    setActivePage(page);
    setMobileNavOpen(false);
  };

  const content = {
    risks: <RiskDeck alerts={overview?.alerts} deadlines={overview?.deadlines} handoff={overview?.handoff} />,
    flow: <FlowDeck flow={overview?.flow} trend={overview?.orderTrend12h} />,
    capacity: <TeamDeck workload={overview?.workload} team={overview?.team} summary={summary} />,
    deadlines: <ForecastDeck forecast={overview?.forecast} />,
    handoffs: <HandoffDeck handoff={overview?.handoff} />,
  };

  return (
    <div className="cc-app">
      <aside className={`cc-sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <div className="cc-brand">
          <span className="cc-brand-mark">MH</span>
          <div><strong>Magic Hands</strong><span>Operations</span></div>
          <button className="cc-mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>
        </div>

        <nav className="cc-nav" aria-label="Operations navigation">
          <span className="cc-nav-label">Workspace</span>
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={activePage === item.id ? "active" : ""} onClick={() => selectPage(item.id)}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          <span className="cc-nav-label cc-nav-label-display">Display</span>
          <button onClick={onOpenWallboard}><Icon name="screen" /><span>Wallboard Mode</span></button>
        </nav>

        <div className="cc-sidebar-foot">
          <span className="cc-live-dot" /> Live operations feed
          <small>Refreshes every 30 seconds</small>
        </div>
      </aside>
      {mobileNavOpen ? <button className="cc-nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" /> : null}

      <main className="cc-main">
        <header className="cc-topbar">
          <button className="cc-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Icon name="menu" /></button>
          <div className="cc-heading">
            <span className="cc-kicker">Live operations</span>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="cc-top-actions">
            <div className="cc-updated"><span className="cc-live-dot" /><div><small>Last updated</small><strong>{formatTimestamp(overview?.generatedAt)}</strong></div></div>
            <button className="cc-icon-button" onClick={onRefresh} disabled={loading} title="Refresh data"><Icon name="refresh" /></button>
            <button className="cc-avatar" onClick={onLogout} title="Log out">{String(user?.firstName || user?.name || "A").charAt(0).toUpperCase()}</button>
          </div>
        </header>

        {error ? <div className="cc-error">{error}</div> : null}

        <div className="cc-content">
          {activePage === "command" ? (
            <>
              <section className="cc-metrics">
                <Metric label="Critical actions" value={formatNumber((overview?.alerts || []).filter((item) => item.severity === "critical").length)} detail="Need intervention now" tone="critical" />
                <Metric label="Overdue" value={formatNumber(summary.overdueProjects || 0)} detail="Past delivery commitment" tone="danger" />
                <Metric label="Due within 72h" value={formatNumber(summary.approachingDeadlines72h || 0)} detail="Near-term delivery window" tone="warning" />
                <Metric label="Blocked / on hold" value={formatNumber(summary.blockedProjects || 0)} detail="Unable to progress" tone="warning" />
                <Metric label="Team utilization" value={formatPercent(summary.teamUtilizationPercent || 0)} detail={`${formatNumber(summary.openProjects || 0)} open projects`} tone="positive" />
              </section>

              <section className="cc-dashboard-grid">
                <PriorityQueue alerts={overview?.alerts} deadlines={overview?.deadlines} />
                <div className="cc-card cc-panel-wrap"><PipelinePanel pipeline={overview?.pipeline} /></div>
                <div className="cc-card cc-panel-wrap cc-deadline-wrap"><DeadlinesPanel deadlines={(overview?.deadlines || []).slice(0, 8)} /></div>
                <div className="cc-card cc-panel-wrap"><CapacityPanel workload={(overview?.workload || []).slice(0, 6)} teamUtilizationPercent={summary.teamUtilizationPercent} /></div>
                <div className="cc-card cc-panel-wrap"><OrderTrendPanel trend={overview?.orderTrend12h} /></div>
                <div className="cc-card cc-panel-wrap"><AlertsPanel alerts={(overview?.alerts || []).slice(0, 5)} /></div>
              </section>
            </>
          ) : (
            <section className="cc-page-panel">
              {activePage === "deadlines" ? (
                <div className="cc-detail-stack">
                  <DeadlinesPanel deadlines={overview?.deadlines} />
                  {content[activePage]}
                </div>
              ) : content[activePage]}
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default CommandCenter;
