import { useEffect, useMemo, useRef, useState } from "react";
import { buildFileKey } from "../utils/referenceAttachments";

const canUseObjectUrls = () =>
  typeof URL !== "undefined" &&
  typeof URL.createObjectURL === "function" &&
  typeof URL.revokeObjectURL === "function";

const toFileList = (files) => (Array.isArray(files) ? files.filter(Boolean) : []);

const defer = (callback) => {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled) callback();
  });
  return () => {
    cancelled = true;
  };
};

const useObjectUrls = (files) => {
  const entriesRef = useRef(new Map());
  const [urlsByKey, setUrlsByKey] = useState({});
  const activeFiles = useMemo(() => toFileList(files), [files]);

  useEffect(() => {
    if (!canUseObjectUrls()) {
      return defer(() => setUrlsByKey({}));
    }

    const previousEntries = entriesRef.current;
    const nextEntries = new Map();
    const nextUrlsByKey = {};
    const activeKeys = new Set();

    activeFiles.forEach((file, index) => {
      const key = buildFileKey(file) || `file-${index}`;
      if (activeKeys.has(key)) return;
      activeKeys.add(key);

      const existingEntry = previousEntries.get(key);
      if (existingEntry) {
        nextEntries.set(key, existingEntry);
        nextUrlsByKey[key] = existingEntry.url;
        return;
      }

      const url = URL.createObjectURL(file);
      nextEntries.set(key, { file, url });
      nextUrlsByKey[key] = url;
    });

    previousEntries.forEach((entry, key) => {
      if (!activeKeys.has(key)) {
        URL.revokeObjectURL(entry.url);
      }
    });

    entriesRef.current = nextEntries;
    return defer(() => setUrlsByKey(nextUrlsByKey));
  }, [activeFiles]);

  useEffect(
    () => () => {
      entriesRef.current.forEach((entry) => {
        URL.revokeObjectURL(entry.url);
      });
      entriesRef.current.clear();
    },
    [],
  );

  return urlsByKey;
};

export default useObjectUrls;
