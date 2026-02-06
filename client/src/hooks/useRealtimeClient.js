import { useEffect, useRef } from "react";

const useRealtimeClient = (enabled = true) => {
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      return;
    }

    if (sourceRef.current) return;

    const source = new EventSource("/api/realtime", {
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
      window.dispatchEvent(
        new CustomEvent("mh:data-changed", { detail }),
      );
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
