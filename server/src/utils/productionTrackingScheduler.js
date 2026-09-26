const {
  recalculateAllPendingProduction,
} = require("../services/productionTrackingService");
const {
  runProductionNotificationSweep,
} = require("../services/productionNotificationService");
const {
  runProductionActionFollowUpSweep,
} = require("../services/productionActionFollowUpService");

const configuredInterval = Number.parseInt(
  process.env.PRODUCTION_TRACKING_SCHEDULER_INTERVAL_MS,
  10,
);
const PRODUCTION_TRACKING_INTERVAL_MS = Number.isFinite(configuredInterval)
  ? Math.max(60 * 1000, configuredInterval)
  : 60 * 1000;

let schedulerTimer = null;
let schedulerRunning = false;

const runProductionTrackingSweep = async () => {
  if (schedulerRunning) return null;
  schedulerRunning = true;
  try {
    const tracking = await recalculateAllPendingProduction();
    const notifications = await runProductionNotificationSweep();
    const actionFollowUps = await runProductionActionFollowUpSweep();
    return { tracking, notifications, actionFollowUps };
  } catch (error) {
    console.error("Production tracking scheduler sweep failed:", error);
    return null;
  } finally {
    schedulerRunning = false;
  }
};

const startProductionTrackingScheduler = () => {
  if (process.env.PRODUCTION_TRACKING_SCHEDULER_ENABLED === "false") return;
  if (schedulerTimer) return;

  const initialTimer = setTimeout(runProductionTrackingSweep, 5000);
  initialTimer.unref?.();
  schedulerTimer = setInterval(
    runProductionTrackingSweep,
    PRODUCTION_TRACKING_INTERVAL_MS,
  );
  schedulerTimer.unref?.();
};

module.exports = {
  runProductionTrackingSweep,
  startProductionTrackingScheduler,
};
