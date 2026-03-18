import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "mh-client-theme";

const getAccountStorageKey = (accountKey = "") => {
  if (!accountKey) return "";
  return `${THEME_STORAGE_KEY}:${accountKey}`;
};

const getStoredTheme = (storageKey) => {
  if (typeof window === "undefined") return null;
  if (!storageKey) return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch (error) {
    return null;
  }
};

const normalizeThemeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "light" || normalized === "dark" ? normalized : null;
};

const getSystemTheme = () => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
};

const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
};

const useTheme = ({ accountKey = "", enabled = true, serverTheme } = {}) => {
  const storageKey = enabled ? getAccountStorageKey(accountKey) : "";
  const storedTheme = getStoredTheme(storageKey);
  const normalizedServerTheme = normalizeThemeValue(serverTheme);
  const [theme, setTheme] = useState(
    normalizedServerTheme || storedTheme || getSystemTheme(),
  );
  const [hasStoredPreference, setHasStoredPreference] = useState(
    Boolean(normalizedServerTheme || storedTheme),
  );

  useEffect(() => {
    if (!enabled || !accountKey) {
      setTheme(getSystemTheme());
      setHasStoredPreference(false);
      return;
    }

    const nextServerTheme = normalizeThemeValue(serverTheme);
    if (nextServerTheme) {
      setTheme(nextServerTheme);
      setHasStoredPreference(true);
      return;
    }

    const nextStoredTheme = getStoredTheme(getAccountStorageKey(accountKey));
    if (nextStoredTheme) {
      setTheme(nextStoredTheme);
      setHasStoredPreference(true);
    } else {
      setTheme(getSystemTheme());
      setHasStoredPreference(false);
    }
  }, [accountKey, enabled, serverTheme]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!hasStoredPreference) return;
    if (!enabled || !accountKey) return;
    try {
      window.localStorage.setItem(getAccountStorageKey(accountKey), theme);
    } catch (error) {
      // ignore storage write errors
    }
  }, [theme, hasStoredPreference, accountKey, enabled]);

  useEffect(() => {
    if (hasStoredPreference) return undefined;
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => {
      setTheme(event.matches ? "dark" : "light");
    };
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
    } else if (media.addListener) {
      media.addListener(handleChange);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handleChange);
      } else if (media.removeListener) {
        media.removeListener(handleChange);
      }
    };
  }, [hasStoredPreference]);

  const toggleTheme = () => {
    if (!enabled || !accountKey) return;
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    setHasStoredPreference(true);
  };

  return { theme, toggleTheme };
};

export default useTheme;
