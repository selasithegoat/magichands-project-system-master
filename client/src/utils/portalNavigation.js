const IPV4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const isIpv4 = (value) => {
  if (!IPV4_REGEX.test(value)) return false;
  const parts = value.split(".").map((part) => Number.parseInt(part, 10));
  return parts.every((part) => Number.isFinite(part) && part >= 0 && part <= 255);
};

const isIpLikeHost = (hostname) =>
  hostname === "localhost" || hostname === "127.0.0.1" || isIpv4(hostname);

const portalSubdomainMap = {
  admin: "admin",
  ops: "ops",
  inventory: "inventory",
};

const portalPathMap = {
  admin: "/admin",
  ops: "/ops",
  inventory: "/inventory",
};

export const buildPortalUrl = (portal) => {
  if (typeof window === "undefined") return "";

  const subdomain = portalSubdomainMap[portal];
  const portalPath = portalPathMap[portal] || "/";

  if (!subdomain) {
    return `${window.location.origin}${portalPath}`;
  }

  const { protocol, hostname, port } = window.location;
  const origin = window.location.origin;

  if (isIpLikeHost(hostname)) {
    return `${origin}${portalPath}`;
  }

  if (hostname.startsWith(`${subdomain}.`)) {
    return origin;
  }

  const portSuffix = port ? `:${port}` : "";
  return `${protocol}//${subdomain}.${hostname}${portSuffix}`;
};

