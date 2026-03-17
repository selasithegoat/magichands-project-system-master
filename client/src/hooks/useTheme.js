import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "mh-client-theme";

const getStoredTheme = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch (error) {
    return null;
  }
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

const useTheme = () => {
  const storedTheme = getStoredTheme();
  const [theme, setTheme] = useState(storedTheme || getSystemTheme());
  const [hasStoredPreference, setHasStoredPreference] = useState(
    Boolean(storedTheme),
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!hasStoredPreference) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // ignore storage write errors
    }
  }, [theme, hasStoredPreference]);

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
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    setHasStoredPreference(true);
  };

  return { theme, toggleTheme };
};

export default useTheme;
