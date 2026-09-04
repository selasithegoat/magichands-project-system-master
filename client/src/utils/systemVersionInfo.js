/* global __APP_RELEASE_INFO__ */
let cachedSystemVersionInfo = null;
let pendingSystemVersionRequest = null;

const bundledReleaseInfo =
  typeof __APP_RELEASE_INFO__ === "object" && __APP_RELEASE_INFO__
    ? __APP_RELEASE_INFO__
    : {};

const applyBundledReleaseInfo = (versionInfo) => {
  const payload = versionInfo && typeof versionInfo === "object" ? versionInfo : {};
  const version = String(bundledReleaseInfo.version || "").trim();
  if (!version) return payload;

  return {
    ...payload,
    version,
    nickname: String(bundledReleaseInfo.nickname || "").trim() || null,
  };
};

export const getCachedSystemVersionInfo = () => cachedSystemVersionInfo;

export const formatVersionDisplay = (versionInfo) => {
  const releaseInfo = applyBundledReleaseInfo(versionInfo);
  const version = String(releaseInfo?.version || "").trim();
  if (!version) return "";

  const nickname = String(releaseInfo?.nickname || "").trim();
  return nickname ? `v${version} · ${nickname}` : `v${version}`;
};

export const fetchSystemVersionInfo = async ({ signal } = {}) => {
  if (cachedSystemVersionInfo) return cachedSystemVersionInfo;
  if (pendingSystemVersionRequest && !signal) return pendingSystemVersionRequest;

  const request = fetch("/api/system/version", {
    credentials: "include",
    cache: "no-store",
    signal,
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      cachedSystemVersionInfo = payload
        ? applyBundledReleaseInfo(payload)
        : null;
      return cachedSystemVersionInfo;
    })
    .finally(() => {
      if (pendingSystemVersionRequest === request) {
        pendingSystemVersionRequest = null;
      }
    });

  if (!signal) {
    pendingSystemVersionRequest = request;
  }

  return request;
};
