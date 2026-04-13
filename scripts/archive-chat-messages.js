const path = require("path");
const dotenv = require("dotenv");

const resolveEnvPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, "..", "server", raw);
};

const dotenvPath = resolveEnvPath(process.env.DOTENV_FILE);
if (dotenvPath) {
  dotenv.config({ path: dotenvPath });
} else {
  dotenv.config();
}

const connectDB = require("../server/src/config/db");
const {
  archiveEligibleChatMessages,
} = require("../server/src/services/chatArchiveService");

const run = async () => {
  await connectDB();
  const summary = await archiveEligibleChatMessages();
  console.log(
    `Archived ${summary.archivedCount} chat message(s) across ${summary.threadCount} thread(s).`,
  );
  process.exit(0);
};

run().catch((error) => {
  console.error("Chat archive script failed:", error);
  process.exit(1);
});
