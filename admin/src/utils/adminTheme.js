export const ADMIN_THEME_STORAGE_KEY = "mh:admin-theme";

export const getInitialAdminTheme = () => {
  if (typeof window === "undefined") return "light";
  const storedTheme = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "light";
};

export const applyAdminTheme = (theme) => {
  if (typeof document === "undefined") return;
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.adminTheme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
};

export const saveAdminTheme = (theme) => {
  const nextTheme = theme === "dark" ? "dark" : "light";
  applyAdminTheme(nextTheme);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
  }
};
