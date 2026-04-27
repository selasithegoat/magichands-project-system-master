let cachedSystemVersionInfo = null;
let pendingSystemVersionRequest = null;

export const getCachedSystemVersionInfo = () => cachedSystemVersionInfo;

export const formatVersionDisplay = (versionInfo) => {
  const version = String(versionInfo?.version || "").trim();
  if (!version) return "";

  const nickname = String(versionInfo?.nickname || "").trim();
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
      cachedSystemVersionInfo = payload || null;
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
