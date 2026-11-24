/**
 * This device's offline copy of each store's bill book, khata and staff register (`book-<businessId>.db`, opened by
 * src/state/book.jsx). Once the server has deleted a store, or the whole account, the copy on the phone is erased
 * too, so deleting really deletes. Signing out leaves it: it may still hold entries that have not synced yet.
 *
 * A database cannot be deleted while it is open, and book.jsx closes it a moment after the store changes, so each
 * deletion waits for that close and tries again briefly if it is still open.
 */
export const bookFile = (businessId) => `book-${businessId}.db`;

const closing = new Map();

/** book.jsx reports the promise that settles once a store's database has closed. */
export const noteBookClosing = (businessId, closed) => {
  closing.set(businessId, closed);
  closed.finally(() => { if (closing.get(businessId) === closed) closing.delete(businessId); }).catch(() => undefined);
};

const missing = (error) => /not.?found|does not exist|no such file/i.test(String(error?.message ?? ''));

/**
 * @param {string[]} businessIds stores whose local book to erase
 * @param {{ remove?: (file: string) => Promise<void>, wait?: (ms: number) => Promise<void>, attempts?: number }} [deps]
 * @returns {Promise<string[]>} the stores whose copy is gone (erased now, or there was none)
 */
export const forgetLocalBooks = async (businessIds = [], deps = {}) => {
  const remove = deps.remove ?? (async (file) => (await import('expo-sqlite')).deleteDatabaseAsync(file));
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = deps.attempts ?? 10;
  // The store's receipt photos (src/lib/receipts.js) go with its book. Never blocks the erase.
  const removePhotos = deps.removePhotos ?? (async (id) => {
    const fs = await import('expo-file-system/legacy').catch(() => null);
    await fs?.deleteAsync(`${fs.documentDirectory}receipts/${id}/`, { idempotent: true }).catch(() => undefined);
  });
  const gone = [];
  for (const id of new Set(businessIds.filter(Boolean))) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await closing.get(id)?.catch(() => undefined);
      try {
        await remove(bookFile(id));
        await removePhotos(id);
        gone.push(id);
        break;
      } catch (error) {
        if (missing(error)) { await removePhotos(id); gone.push(id); break; }
        if (attempt < attempts) await wait(300); // still open: book.jsx is closing it
      }
    }
  }
  return gone;
};
