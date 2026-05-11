const SOUND_COOLDOWN_MS = 1200;
const SOUND_VOLUME = 0.75;

const SOUND_SRC = {
  notification: "/sounds/mh-notification.wav",
  reminder: "/sounds/mh-reminder.wav",
};

let hasUserInteraction = false;
let unlockListenersAttached = false;

const lastPlayedAt = {
  notification: 0,
  reminder: 0,
};

const resolveSoundKind = (notificationType) =>
  String(notificationType || "").toUpperCase() === "REMINDER"
    ? "reminder"
    : "notification";

const createPlaybackSound = (kind) => {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;

  const src = SOUND_SRC[kind];
  if (!src) return null;

  const audio = new Audio();
  audio.preload = "none";
  audio.volume = SOUND_VOLUME;
  audio.src = src;
  return audio;
};

const removeUnlockListeners = (handler) => {
  if (typeof window === "undefined") return;
  window.removeEventListener("pointerdown", handler);
  window.removeEventListener("keydown", handler);
  window.removeEventListener("touchstart", handler);
};

export const initNotificationSound = () => {
  if (typeof window === "undefined" || unlockListenersAttached || hasUserInteraction) {
    return;
  }

  const handleInteractionUnlock = () => {
    hasUserInteraction = true;
    removeUnlockListeners(handleInteractionUnlock);
    unlockListenersAttached = false;
  };

  window.addEventListener("pointerdown", handleInteractionUnlock, {
    passive: true,
  });
  window.addEventListener("keydown", handleInteractionUnlock, { passive: true });
  window.addEventListener("touchstart", handleInteractionUnlock, {
    passive: true,
  });
  unlockListenersAttached = true;
};

export const playNotificationSound = async (
  notificationType,
  enabled = true,
) => {
  if (!enabled || !hasUserInteraction) return false;

  const kind = resolveSoundKind(notificationType);
  const now = Date.now();
  if (now - lastPlayedAt[kind] < SOUND_COOLDOWN_MS) {
    return false;
  }

  const sound = createPlaybackSound(kind);
  if (!sound) return false;

  lastPlayedAt[kind] = now;

  try {
    await sound.play();
    return true;
  } catch {
    return false;
  }
};
