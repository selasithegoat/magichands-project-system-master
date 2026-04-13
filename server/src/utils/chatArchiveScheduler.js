const { archiveEligibleChatMessages } = require("../services/chatArchiveService");

const CHAT_ARCHIVE_SCHEDULER_INTERVAL_MS = Number.isFinite(
  Number.parseInt(process.env.CHAT_ARCHIVE_SCHEDULER_INTERVAL_MS, 10),
)
  ? Number.parseInt(process.env.CHAT_ARCHIVE_SCHEDULER_INTERVAL_MS, 10)
  : 60 * 60 * 1000;

let schedulerStarted = false;
let schedulerRunning = false;

const startChatArchiveScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const runSweep = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      await archiveEligibleChatMessages();
    } catch (error) {
      console.error("Chat archive scheduler failed:", error);
    } finally {
      schedulerRunning = false;
    }
  };

  void runSweep();
  setInterval(runSweep, CHAT_ARCHIVE_SCHEDULER_INTERVAL_MS);
};

module.exports = {
  startChatArchiveScheduler,
};
