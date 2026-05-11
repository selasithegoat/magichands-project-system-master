const SOUND_COOLDOWN_MS = 1200;
const SOUND_VOLUME = 0.75;

const SOUND_SRC = {
  notification: "/sounds/mh-notification.wav",
  newOrder: "/sounds/mh-new-order.wav",
  reminder: "/sounds/mh-reminder.wav",
  message: "/sounds/mh-message.mp3",
};

let hasUserInteraction = false;
let unlockListenersAttached = false;

const lastPlayedAt = {
  notification: 0,
  newOrder: 0,
  reminder: 0,
  message: 0,
};

const resolveSoundKind = (notificationType) => {
  const normalizedType = String(notificationType || "").toUpperCase();
  if (normalizedType === "CHAT_MESSAGE" || normalizedType === "MESSAGE") {
    return "message";
  }
  if (normalizedType === "REMINDER") return "reminder";
  if (normalizedType === "ASSIGNMENT" || normalizedType === "NEW_ORDER") {
    return "newOrder";
  }
  return "notification";
};

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

const playSoundKind = async (kind, enabled = true) => {
  if (!enabled || !hasUserInteraction) return false;

  const now = Date.now();
  if (now - (lastPlayedAt[kind] || 0) < SOUND_COOLDOWN_MS) {
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
  const kind = resolveSoundKind(notificationType);
  return playSoundKind(kind, enabled);
};

export const playMessageSound = async (enabled = true) =>
  playSoundKind("message", enabled);

export const triggerNotificationVibration = (pattern = [200, 100, 200]) => {
  if (
    !hasUserInteraction ||
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return false;
  }

  try {
    return Boolean(navigator.vibrate(pattern));
  } catch {
    return false;
  }
};
