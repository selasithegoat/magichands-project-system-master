import { useCallback, useEffect, useState } from "react";
import ReminderBellIcon from "./icons/ReminderBellIcon";
import XIcon from "./icons/XIcon";
import {
  BROWSER_PUSH_STATUS_EVENT,
  getBrowserPushStatus,
  requestBrowserPushPermission,
  sendBrowserPushTest,
  syncBrowserPushSubscription,
} from "../utils/browserPush";
import "./BrowserPushManager.css";

const PROMPT_DISMISSED_KEY = "mh:browser-push-prompt-dismissed";

const readPromptDismissed = () => {
  try {
    return window.sessionStorage.getItem(PROMPT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
};

const BrowserPushManager = ({ user }) => {
  const userId = String(user?._id || "");
  const pushEnabled = user?.notificationSettings?.push ?? true;
  const [status, setStatus] = useState(() => getBrowserPushStatus());
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(readPromptDismissed);

  const sync = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await syncBrowserPushSubscription({ enabled: pushEnabled });
      setStatus(result?.status || getBrowserPushStatus());
    } catch (error) {
      console.error("Browser notification sync failed:", error);
      setStatus("error");
    }
  }, [pushEnabled, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let initialSyncId = null;

    const handleStatus = (event) => {
      const nextStatus = String(event?.detail?.status || "").trim();
      if (nextStatus) setStatus(nextStatus);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };

    if (document.readyState === "complete") {
      initialSyncId = window.setTimeout(() => {
        void sync();
      }, 0);
    } else {
      window.addEventListener("load", sync, { once: true });
    }

    window.addEventListener(BROWSER_PUSH_STATUS_EVENT, handleStatus);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (initialSyncId !== null) window.clearTimeout(initialSyncId);
      window.removeEventListener("load", sync);
      window.removeEventListener(BROWSER_PUSH_STATUS_EVENT, handleStatus);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [sync, userId]);

  const handleEnable = async () => {
    if (isRequesting) return;
    setIsRequesting(true);
    const result = await requestBrowserPushPermission();
    const nextStatus = result?.status || getBrowserPushStatus();
    if (nextStatus === "subscribed") {
      try {
        await sendBrowserPushTest();
      } catch (error) {
        console.error("Browser notification test failed:", error);
        setStatus("error");
        setIsRequesting(false);
        return;
      }
    }
    setStatus(nextStatus);
    setIsRequesting(false);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      window.sessionStorage.setItem(PROMPT_DISMISSED_KEY, "true");
    } catch {
      // Dismissal remains valid for the current render when storage is blocked.
    }
  };

  const shouldPrompt =
    userId &&
    pushEnabled &&
    !isDismissed &&
    ["default", "insecure", "error"].includes(status);

  if (!shouldPrompt) return null;

  const isInsecure = status === "insecure";
  const description = isInsecure
    ? "Desktop notifications require a trusted HTTPS portal address on this network."
    : status === "error"
      ? "This device could not finish notification setup. Try the setup again."
      : "Allow this device to show brief project and workflow alerts.";

  return (
    <aside className="browser-push-prompt" aria-live="polite">
      <span className="browser-push-prompt__icon" aria-hidden="true">
        <ReminderBellIcon width="18" height="18" />
      </span>
      <div className="browser-push-prompt__copy">
        <strong>{isInsecure ? "HTTPS required" : "Enable desktop notifications"}</strong>
        <p>{description}</p>
      </div>
      {!isInsecure && (
        <button
          type="button"
          className="browser-push-prompt__enable"
          onClick={handleEnable}
          disabled={isRequesting}
        >
          {isRequesting ? "Enabling…" : status === "error" ? "Try again" : "Enable"}
        </button>
      )}
      <button
        type="button"
        className="browser-push-prompt__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification setup"
      >
        <XIcon width="16" height="16" />
      </button>
    </aside>
  );
};

export default BrowserPushManager;
