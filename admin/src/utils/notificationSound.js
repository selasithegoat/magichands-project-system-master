const SOUND_COOLDOWN_MS = 1200;
const SOUND_VOLUME = 0.75;

const SOUND_SRC = {
  notification: "/sounds/mh-notification.wav",
  reminder: "/sounds/mh-reminder.wav",
};

let hasUserInteraction = false;
let unlockListenersAttached = false;
let notificationSessionActive = false;
const activeSounds = new Set();

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

const stopSound = (sound) => {
  if (!sound) return;

  try {
    sound.pause();
    sound.currentTime = 0;
  } catch {
    // The sound may already have ended or may not have started loading yet.
  }
  activeSounds.delete(sound);
};

export const setNotificationSoundSessionActive = (active) => {
  notificationSessionActive = Boolean(active);
  if (notificationSessionActive) return;

  for (const sound of Array.from(activeSounds)) {
    stopSound(sound);
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
  if (!notificationSessionActive || !enabled || !hasUserInteraction) {
    return false;
  }

  const kind = resolveSoundKind(notificationType);
  const now = Date.now();
  if (now - lastPlayedAt[kind] < SOUND_COOLDOWN_MS) {
    return false;
  }

  const sound = createPlaybackSound(kind);
  if (!sound) return false;

  lastPlayedAt[kind] = now;
  activeSounds.add(sound);

  const releaseSound = () => activeSounds.delete(sound);
  sound.addEventListener("ended", releaseSound, { once: true });
  sound.addEventListener("error", releaseSound, { once: true });

  try {
    await sound.play();
    if (!notificationSessionActive) {
      stopSound(sound);
      return false;
    }
    return true;
  } catch {
    activeSounds.delete(sound);
    return false;
  }
};
