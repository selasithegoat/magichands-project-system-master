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
  // Shared client components are reused inside the admin portal. Keep their
  // theme contract in step with the admin-specific attribute so drawers,
  // dialogs, FABs, and imported pages never remain stuck in the opposite mode.
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  window.dispatchEvent(
    new CustomEvent("mh:admin-theme-change", { detail: { theme: nextTheme } }),
  );
};

export const saveAdminTheme = (theme) => {
  const nextTheme = theme === "dark" ? "dark" : "light";
  applyAdminTheme(nextTheme);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
  }
};
