const getFetchClient = async () => {
  if (typeof fetch === "function") return fetch;
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
};

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const DEFAULT_SMS_ENDPOINT = "https://sms.arkesel.com/api/v2/sms/send";
const LEGACY_SMS_ENDPOINT_MARKERS = [
  "sms.arkesel.com/sms/api",
  "arkesel.com/sms/api",
  "action=send-sms",
];

const looksLikeLegacyEndpoint = (value) =>
  LEGACY_SMS_ENDPOINT_MARKERS.some((marker) => value.includes(marker));

const normalizeEndpoint = (value) => {
  if (!value) return value;
  if (value.startsWith("http://")) {
    return value.replace(/^http:\/\//i, "https://");
  }
  return value;
};

const resolveSmsEndpoint = () => {
  const configured = toText(process.env.ARKESEL_BASE_URL);
  if (!configured) return DEFAULT_SMS_ENDPOINT;
  if (configured.includes("api.arkesel.com/v1/sms/send")) {
    return DEFAULT_SMS_ENDPOINT;
  }
  if (looksLikeLegacyEndpoint(configured)) {
    return DEFAULT_SMS_ENDPOINT;
  }
  return normalizeEndpoint(configured);
};

const sendSms = async ({ to, message }) => {
  const apiKey = toText(process.env.ARKESEL_API_KEY);
  const senderId = toText(process.env.ARKESEL_SENDER_ID);
  const baseUrl = resolveSmsEndpoint();

  if (!apiKey || !senderId || !baseUrl) {
    throw new Error("Arkesel SMS is not configured.");
  }

  const recipients = Array.isArray(to)
    ? to.map((entry) => toText(entry)).filter(Boolean)
    : [toText(to)].filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("Recipient phone number is required.");
  }

  const text = toText(message);
  if (!text) {
    throw new Error("SMS message cannot be empty.");
  }

  const payload = {
    sender: senderId,
    message: text,
    recipients,
  };

  const fetchClient = await getFetchClient();
  const sendRequest = async (url) => {
    const response = await fetchClient(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText ? { raw: rawText } : null;
    }

    return { response, data };
  };

  const primaryResult = await sendRequest(baseUrl);
  if (!primaryResult.response.ok) {
    const shouldRetry =
      baseUrl !== DEFAULT_SMS_ENDPOINT &&
      [404, 405].includes(primaryResult.response.status);
    if (shouldRetry) {
      const fallbackResult = await sendRequest(DEFAULT_SMS_ENDPOINT);
      if (fallbackResult.response.ok) {
        return fallbackResult.data;
      }
    }

    const error = new Error(
      primaryResult.data?.message ||
        `Arkesel SMS failed (${primaryResult.response.status}).`,
    );
    error.response = primaryResult.data;
    throw error;
  }

  return primaryResult.data;
};

module.exports = { sendSms };
