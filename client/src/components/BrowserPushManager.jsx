import { useEffect } from "react";
import { syncBrowserPushSubscription } from "../utils/browserPush";

const BrowserPushManager = ({ user }) => {
  const userId = String(user?._id || "");
  const pushEnabled = user?.notificationSettings?.push ?? true;

  useEffect(() => {
    if (!userId) return undefined;

    const sync = () => {
      syncBrowserPushSubscription({ enabled: pushEnabled }).catch((error) => {
        console.error("Browser notification sync failed:", error);
      });
    };

    if (document.readyState === "complete") {
      sync();
      return undefined;
    }
    window.addEventListener("load", sync, { once: true });
    return () => window.removeEventListener("load", sync);
  }, [pushEnabled, userId]);

  return null;
};

export default BrowserPushManager;
