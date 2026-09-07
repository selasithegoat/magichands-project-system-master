export async function readProductionFollowUpResponse(response, fallback) {
  if (response.status === 404) {
    throw new Error("Production follow-up is unavailable on the server. The backend needs to be updated or restarted.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.status === 502 || response.status === 503
      ? "The server is temporarily unavailable. Please try again shortly."
      : "The server returned an unexpected response. Please try again shortly.");
  }
  if (!response.ok) throw new Error(payload?.message || fallback);
  return payload;
}
