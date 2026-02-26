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

const soundCache = {
  notification: null,
  reminder: null,
};

const resolveSoundKind = (notificationType) =>
  String(notificationType || "").toUpperCase() === "REMINDER"
    ? "reminder"
    : "notification";

const createSound = (kind) => {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;

  const src = SOUND_SRC[kind];
  if (!src) return null;

  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = SOUND_VOLUME;
  return audio;
};

const getSound = (kind) => {
  if (!soundCache[kind]) {
    soundCache[kind] = createSound(kind);
  }
  return soundCache[kind];
};

const removeUnlockListeners = (handler) => {
  if (typeof window === "undefined") return;
  window.removeEventListener("pointerdown", handler);
  window.removeEventListener("keydown", handler);
  window.removeEventListener("touchstart", handler);
};

export const initNotificationSound = () => {
  if (typeof window === "undefined" || unlockListenersAttached) return;

  const primeSounds = () => {
    const notificationSound = getSound("notification");
    const reminderSound = getSound("reminder");

    notificationSound?.load?.();
    reminderSound?.load?.();
  };

  const handleInteractionUnlock = () => {
    hasUserInteraction = true;
    primeSounds();
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

  primeSounds();
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

  const baseSound = getSound(kind);
  if (!baseSound) return false;

  lastPlayedAt[kind] = now;

  try {
    // Clone so repeated alerts can overlap naturally.
    const instance = baseSound.cloneNode(true);
    instance.volume = SOUND_VOLUME;
    await instance.play();
    return true;
  } catch {
    return false;
  }
};
