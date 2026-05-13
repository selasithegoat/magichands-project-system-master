const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const serverPackage = require("../../package.json");

const repoRoot = path.resolve(__dirname, "../../..");
const versionFilePath = path.join(repoRoot, "VERSION");
const versionNicknamesFilePath = path.join(repoRoot, "VERSION_NICKNAMES.json");
const serverStartedAt = new Date().toISOString();

const toCleanString = (value) => String(value || "").trim();

const readFirstLine = (filePath) => {
  try {
    return toCleanString(fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0]);
  } catch {
    return "";
  }
};

const readGitValue = (args) => {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const shortenCommit = (value) => {
  const commit = toCleanString(value);
  if (!commit) return null;
  return commit.length > 12 ? commit.slice(0, 12) : commit;
};

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
};

const getNicknameKeys = (version) => {
  const [major, minor, patch] = String(version || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return [
    major && minor && patch ? `${major}.${minor}.${patch}` : "",
    major && minor ? `${major}.${minor}` : "",
    major || "",
  ].filter(Boolean);
};

const resolveVersion = () =>
  toCleanString(process.env.APP_VERSION) ||
  readFirstLine(versionFilePath) ||
  toCleanString(serverPackage.version) ||
  "0.0.0";

const resolveVersionNickname = (version) => {
  const override = toCleanString(process.env.APP_VERSION_NICKNAME);
  if (override) return override;

  const nicknames = readJsonFile(versionNicknamesFilePath);
  const keys = getNicknameKeys(version);
  for (const key of keys) {
    const nickname = toCleanString(nicknames[key]);
    if (nickname) return nickname;
  }

  return null;
};

const gitStatus = readGitValue(["status", "--short"]);
const gitCommit = readGitValue(["rev-parse", "--short", "HEAD"]);
const gitBranch = readGitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
const version = resolveVersion();

const systemVersion = {
  name: "MagicHands",
  version,
  nickname: resolveVersionNickname(version),
  commit: shortenCommit(
    process.env.APP_COMMIT ||
      process.env.GIT_COMMIT ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      gitCommit,
  ),
  branch:
    toCleanString(
      process.env.APP_BRANCH ||
        process.env.GIT_BRANCH ||
        process.env.VERCEL_GIT_COMMIT_REF,
    ) ||
    gitBranch ||
    null,
  builtAt:
    toCleanString(
      process.env.APP_BUILT_AT || process.env.BUILD_TIME || process.env.BUILT_AT,
    ) || null,
  startedAt: serverStartedAt,
  environment: toCleanString(process.env.NODE_ENV) || "development",
  dirty: gitStatus === null ? null : Boolean(gitStatus),
};

const getSystemVersion = () => ({ ...systemVersion });

module.exports = {
  getSystemVersion,
};
