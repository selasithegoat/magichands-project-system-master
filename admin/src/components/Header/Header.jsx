import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Header.css";
import { SearchIcon, BellIcon } from "../../icons/Icons";
import { adminNavigationItems } from "../../config/adminNavigation";
import { getInitialAdminTheme, saveAdminTheme } from "../../utils/adminTheme";
import NotificationDropdown from "./NotificationDropdown";
import ReminderAlertModal from "./ReminderAlertModal";
import useNotifications from "../../hooks/useNotifications";

const formatHeaderDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const Header = ({ onMenuClick, user }) => {
  const navigate = useNavigate();
  const searchRegionRef = useRef(null);
  const searchInputRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [theme, setTheme] = useState(getInitialAdminTheme);
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    activeReminderAlert,
    reminderActionLoading,
    reminderActionError,
    handleReminderAlertAction,
    handleReminderNavigate,
    handleReminderDismiss,
  } = useNotifications({
    soundEnabled: user?.notificationSettings?.sound ?? true,
    userId: user?._id || "",
  });

  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return adminNavigationItems.slice(0, 6);

    return adminNavigationItems.filter((item) =>
      item.label.toLowerCase().includes(query),
    );
  }, [searchValue]);

  useEffect(() => {
    const updateDate = () => setCurrentDate(new Date());
    const timer = window.setInterval(updateDate, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!searchRegionRef.current?.contains(event.target)) {
        setIsSearchOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }

      if (event.key === "Escape") {
        setIsSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const goToSearchResult = (item) => {
    navigate(item.to);
    setSearchValue("");
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (searchResults[0]) goToSearchResult(searchResults[0]);
  };

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "light" ? "dark" : "light";
      saveAdminTheme(nextTheme);
      return nextTheme;
    });
  };

  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="header-search-region" ref={searchRegionRef}>
          <form className="header-search" onSubmit={handleSearchSubmit}>
            <SearchIcon className="header-search-icon" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setIsSearchOpen(true);
              }}
              onFocus={() => setIsSearchOpen(true)}
              placeholder="Search admin pages..."
              aria-label="Search admin pages"
              aria-expanded={isSearchOpen}
              aria-controls="admin-search-results"
              autoComplete="off"
            />
            <kbd aria-hidden="true">Ctrl K</kbd>
          </form>

          {isSearchOpen && (
            <div
              className="header-search-results"
              id="admin-search-results"
              role="listbox"
              aria-label="Admin page results"
            >
              <span className="header-search-results-label">
                {searchValue.trim() ? "Search results" : "Quick navigation"}
              </span>
              {searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    type="button"
                    key={item.to}
                    role="option"
                    aria-selected="false"
                    onClick={() => goToSearchResult(item)}
                  >
                    <span>{item.label}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ))
              ) : (
                <span className="header-search-empty">No matching pages</span>
              )}
            </div>
          )}
        </div>

        <div
          className="header-date"
          aria-label={`Today is ${formatHeaderDate(currentDate)}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 3v4M17 3v4M3 10h18" />
          </svg>
          <time dateTime={currentDate.toISOString().slice(0, 10)}>
            {formatHeaderDate(currentDate)}
          </time>
        </div>
      </div>

      <div className="header-actions">
        <div className="notification-container">
          <button
            type="button"
            className="notification-btn"
            onClick={() => setIsDropdownOpen((current) => !current)}
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            aria-expanded={isDropdownOpen}
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span className="notification-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {isDropdownOpen && (
            <NotificationDropdown
              onClose={() => setIsDropdownOpen(false)}
              notifications={notifications}
              loading={loading}
              markAsRead={markAsRead}
              markAllAsRead={markAllAsRead}
              clearNotifications={clearNotifications}
            />
          )}
        </div>

        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
          title={
            theme === "light" ? "Switch to dark mode" : "Switch to light mode"
          }
        >
          {theme === "light" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />
            </svg>
          )}
        </button>
      </div>

      <ReminderAlertModal
        reminder={activeReminderAlert}
        loading={reminderActionLoading}
        error={reminderActionError}
        onSnooze={() => handleReminderAlertAction("snooze")}
        onStop={() => handleReminderAlertAction("stop")}
        onComplete={() => handleReminderAlertAction("complete")}
        onNavigateProject={handleReminderNavigate}
        onClose={handleReminderDismiss}
      />
    </header>
  );
};

export default Header;
