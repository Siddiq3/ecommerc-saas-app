import { copyAsync, deleteAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';

/**
 * Receipt photos stay on the phone that took them, in the app's documents folder (not the
 * cache, which the system may clear). The picked file is copied, so the photo survives the
 * picker cleaning up after itself.
 * One folder per store, so deleting a store's offline book takes its photos too.
 * ponytail: not uploaded, so other phones and a reinstall don't see it; upload when asked for.
 */
export const receiptsDir = (businessId) => `${documentDirectory}receipts/${businessId}/`;

export const keepReceipt = async (pickedUri, entryId, businessId) => {
  const dir = receiptsDir(businessId);
  await makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const ext = (/\.(\w{3,4})$/.exec(pickedUri)?.[1] ?? 'jpg').toLowerCase();
  const uri = `${dir}${entryId}-${Date.now()}.${ext}`;
  await copyAsync({ from: pickedUri, to: uri });
  return uri;
};

/** Never throws: a photo that is already gone is what we wanted. */
export const dropReceipt = (uri) => deleteAsync(uri, { idempotent: true }).catch(() => undefined);
