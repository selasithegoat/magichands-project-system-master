export const resolvePortalSource = () => {
  if (typeof window === "undefined") return "";
  const portal = String(window.__MH_PORTAL__ || "").trim().toLowerCase();
  return portal === "admin" ? "admin" : "";
};

export const appendPortalSource = (url = "", source = "") => {
  if (!source) return url;
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}source=${encodeURIComponent(source)}`;
};
