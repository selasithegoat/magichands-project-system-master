const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

export const getCurrentUser = () => request("/api/auth/me");

export const getOpsWallboardSession = () => request("/api/ops/wallboard/session");

export const loginWithCredentials = ({ employeeId, password }) =>
  request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, password }),
  });

export const logoutSession = () =>
  request("/api/auth/logout", {
    method: "POST",
  });

export const getOpsWallboardOverview = () =>
  request("/api/ops/wallboard/overview");
