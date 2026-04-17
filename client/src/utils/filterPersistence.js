const FILTER_STORAGE_PREFIX = "mh:persisted-filter-state:";

const isPlainObject = (value) =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const resolveValue = (value) =>
  typeof value === "function" ? value() : value;

const getStorageKey = (key) => `${FILTER_STORAGE_PREFIX}${String(key || "").trim()}`;

const getStorage = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const mergeWithFallback = (storedValue, fallbackValue) => {
  if (isPlainObject(storedValue) && isPlainObject(fallbackValue)) {
    return {
      ...fallbackValue,
      ...storedValue,
    };
  }
  return storedValue;
};

export const readPersistedFilterState = (key, fallbackValue, sanitize) => {
  const resolvedFallback = resolveValue(fallbackValue);
  const storageKey = getStorageKey(key);
  const storage = getStorage();
  if (!storage || !storageKey.trim()) {
    return resolvedFallback;
  }

  try {
    const rawValue = storage.getItem(storageKey);
    if (!rawValue) {
      return resolvedFallback;
    }

    const parsedValue = JSON.parse(rawValue);
    const mergedValue = mergeWithFallback(parsedValue, resolvedFallback);
    return typeof sanitize === "function"
      ? sanitize(mergedValue, resolvedFallback)
      : mergedValue;
  } catch {
    return resolvedFallback;
  }
};

export const writePersistedFilterState = (key, value) => {
  const storageKey = getStorageKey(key);
  const storage = getStorage();
  if (!storage || !storageKey.trim()) {
    return;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage write failures so page interaction still works.
  }
};

export const removePersistedFilterState = (key) => {
  const storageKey = getStorageKey(key);
  const storage = getStorage();
  if (!storage || !storageKey.trim()) {
    return;
  }

  try {
    storage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
};

export const clearPersistedFilterState = () => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const keysToRemove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(FILTER_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      storage.removeItem(key);
    });
  } catch {
    // Ignore storage cleanup failures.
  }
};
