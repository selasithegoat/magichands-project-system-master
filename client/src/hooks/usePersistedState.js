import { useCallback, useEffect, useRef, useState } from "react";
import {
  readPersistedFilterState,
  removePersistedFilterState,
  writePersistedFilterState,
} from "../utils/filterPersistence";

const usePersistedState = (storageKey, initialValue, options = {}) => {
  const { enabled = true, sanitize } = options;
  const initialValueRef = useRef();
  const sanitizeRef = useRef(sanitize);

  if (initialValueRef.current === undefined) {
    initialValueRef.current =
      typeof initialValue === "function" ? initialValue() : initialValue;
  }

  useEffect(() => {
    sanitizeRef.current = sanitize;
  }, [sanitize]);

  const readValue = useCallback(
    () =>
      enabled
        ? readPersistedFilterState(
            storageKey,
            initialValueRef.current,
            sanitizeRef.current,
          )
        : initialValueRef.current,
    [enabled, storageKey],
  );

  const [value, setValue] = useState(readValue);

  useEffect(() => {
    setValue(readValue());
  }, [readValue]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    writePersistedFilterState(storageKey, value);
  }, [enabled, storageKey, value]);

  const resetValue = useCallback(() => {
    removePersistedFilterState(storageKey);
    setValue(initialValueRef.current);
  }, [storageKey]);

  return [value, setValue, resetValue];
};

export default usePersistedState;
