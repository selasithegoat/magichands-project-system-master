import React from "react";
import {
  fetchSystemVersionInfo,
  getCachedSystemVersionInfo,
} from "../utils/systemVersionInfo";

const useSystemVersionInfo = ({ enabled = true, initialValue = null } = {}) => {
  const [versionInfo, setVersionInfo] = React.useState(
    () => initialValue || getCachedSystemVersionInfo(),
  );

  React.useEffect(() => {
    if (!enabled) return undefined;
    if (versionInfo) return undefined;

    const controller = new AbortController();
    let isMounted = true;

    fetchSystemVersionInfo({ signal: controller.signal })
      .then((payload) => {
        if (isMounted && payload) {
          setVersionInfo(payload);
        }
      })
      .catch((error) => {
        if (isMounted && error?.name !== "AbortError") {
          setVersionInfo(null);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [enabled, versionInfo]);

  return versionInfo;
};

export default useSystemVersionInfo;
