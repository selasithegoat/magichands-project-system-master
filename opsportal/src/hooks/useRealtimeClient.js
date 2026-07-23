import { useEffect, useRef } from "react";
import {
  addRealtimeClientIdToUrl,
  getRealtimeClientId,
} from "../utils/realtimeClientIdentity";

const useRealtimeClient = (enabled = true) => {
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      return undefined;
    }

    if (sourceRef.current) return undefined;

    const realtimeClientId = getRealtimeClientId();
    const source = new EventSource(addRealtimeClientIdToUrl("/api/realtime"), {
      withCredentials: true,
    });
    sourceRef.current = source;

    const handleChange = (event) => {
      let detail = {};
      try {
        detail = event?.data ? JSON.parse(event.data) : {};
      } catch {
        detail = {};
      }
      if (detail?.sourceClientId === realtimeClientId) return;
      window.dispatchEvent(new CustomEvent("mh:ops-data-changed", { detail }));
    };

    source.addEventListener("data_changed", handleChange);

    return () => {
      source.removeEventListener("data_changed", handleChange);
      source.close();
      sourceRef.current = null;
    };
  }, [enabled]);
};

export default useRealtimeClient;
