const {
  runSampleRetrievalReminderSweep,
} = require("../services/sampleRetrievalReminderService");

const configuredInterval = Number.parseInt(
  process.env.SAMPLE_RETRIEVAL_REMINDER_INTERVAL_MS,
  10,
);
const SAMPLE_RETRIEVAL_REMINDER_INTERVAL_MS = Number.isFinite(configuredInterval)
  ? Math.max(60 * 1000, configuredInterval)
  : 15 * 60 * 1000;

let schedulerTimer = null;
let schedulerRunning = false;

const runSweep = async () => {
  if (schedulerRunning) return null;
  schedulerRunning = true;
  try {
    return await runSampleRetrievalReminderSweep();
  } catch (error) {
    console.error("Sample retrieval reminder sweep failed:", error);
    return null;
  } finally {
    schedulerRunning = false;
  }
};

const startSampleRetrievalReminderScheduler = () => {
  if (process.env.SAMPLE_RETRIEVAL_REMINDER_ENABLED === "false") return;
  if (schedulerTimer) return;

  const initialTimer = setTimeout(runSweep, 7000);
  initialTimer.unref?.();
  schedulerTimer = setInterval(runSweep, SAMPLE_RETRIEVAL_REMINDER_INTERVAL_MS);
  schedulerTimer.unref?.();
};

module.exports = {
  runSampleRetrievalReminderSweep: runSweep,
  startSampleRetrievalReminderScheduler,
};
