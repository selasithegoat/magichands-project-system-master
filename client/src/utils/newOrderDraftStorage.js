const DB_NAME = "mh-client-drafts";
const STORE_NAME = "new-order-drafts";
const DB_VERSION = 1;
const DRAFT_VERSION = 1;

const supportsIndexedDb = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const openDraftDatabase = () =>
  new Promise((resolve, reject) => {
    if (!supportsIndexedDb()) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Unable to open New Order draft database."));
  });

const runStoreRequest = async (mode, handler) => {
  const db = await openDraftDatabase();
  if (!db) return null;

  return await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    let request;
    try {
      request = handler(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () =>
      reject(request.error || new Error("New Order draft request failed."));

    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close errors.
      }
    };

    transaction.oncomplete = closeDb;
    transaction.onabort = closeDb;
    transaction.onerror = closeDb;
  });
};

const normalizeAccountKey = (accountKey) =>
  String(accountKey || "default").trim() || "default";

const buildMetaKey = (accountKey) =>
  `new-order-draft:${normalizeAccountKey(accountKey)}:meta`;

const buildFilesKey = (accountKey) =>
  `new-order-draft:${normalizeAccountKey(accountKey)}:files`;

export const loadNewOrderDraft = async (accountKey) => {
  const [meta, files] = await Promise.all([
    runStoreRequest("readonly", (store) => store.get(buildMetaKey(accountKey))),
    runStoreRequest("readonly", (store) => store.get(buildFilesKey(accountKey))),
  ]);

  const normalizedMeta =
    meta && typeof meta === "object" && meta.version === DRAFT_VERSION ? meta : null;
  const normalizedFiles =
    files && typeof files === "object" && files.version === DRAFT_VERSION
      ? files
      : null;

  if (!normalizedMeta && !normalizedFiles) {
    return null;
  }

  return {
    formData: normalizedMeta?.formData || null,
    selectedFileNotes: normalizedMeta?.selectedFileNotes || {},
    existingSampleImage: normalizedMeta?.existingSampleImage || "",
    existingSampleImageNote: normalizedMeta?.existingSampleImageNote || "",
    existingAttachments: normalizedMeta?.existingAttachments || [],
    selectedFiles: normalizedFiles?.selectedFiles || [],
  };
};

export const saveNewOrderDraftMeta = async (accountKey, payload) =>
  runStoreRequest("readwrite", (store) =>
    store.put(
      {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        ...payload,
      },
      buildMetaKey(accountKey),
    ),
  );

export const saveNewOrderDraftFiles = async (accountKey, selectedFiles) =>
  runStoreRequest("readwrite", (store) =>
    store.put(
      {
        version: DRAFT_VERSION,
        savedAt: Date.now(),
        selectedFiles: Array.isArray(selectedFiles) ? selectedFiles : [],
      },
      buildFilesKey(accountKey),
    ),
  );

export const clearNewOrderDraft = async (accountKey) => {
  await Promise.all([
    runStoreRequest("readwrite", (store) => store.delete(buildMetaKey(accountKey))),
    runStoreRequest("readwrite", (store) => store.delete(buildFilesKey(accountKey))),
  ]);
};
