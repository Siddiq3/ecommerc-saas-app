import * as ImagePicker from 'expo-image-picker';
import { MAX_UPLOAD_BYTES } from '@storekit/shared';
import { businesses, uploads } from '../api/endpoints.js';

/**
 * Image upload: pick, authorize, PUT to storage, confirm.
 *
 * The bytes go straight from the phone to R2 on a presigned URL — they never pass through
 * our API, which is what keeps a Lambda from having to buffer an 8MB photo. The key is
 * generated server-side, so the app cannot choose where its file lands.
 */

const MIME_BY_EXTENSION = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const contentTypeOf = (asset) => {
  if (asset.mimeType && MIME_BY_EXTENSION[asset.mimeType.split('/')[1]]) return asset.mimeType;
  const extension = String(asset.uri ?? '').split('.').pop()?.toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
};

/** `aspect: null` lets the owner crop freely — a logo is rarely square. */
export const pickImage = async ({ aspect = [1, 1] } = {}) => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    const error = new Error('StoreKit needs access to your photos to add images.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Square, because the storefront grid is square and cropping here beats cropping later.
    allowsEditing: true,
    ...(aspect ? { aspect } : {}),
    // Recompressed on device: a modern phone photo is 5MB of detail nobody will see in a
    // 400px product tile, and the merchant is probably on mobile data.
    quality: 0.8,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
};

export const takePhoto = async () => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    const error = new Error('StoreKit needs access to your camera to photograph products.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
};

/**
 * Uploads a picked asset and returns the stored image reference.
 *
 * @returns {Promise<{ imageKey: string, publicUrl: string, width?: number, height?: number }>}
 */
export const uploadImage = async (businessId, asset, { purpose = 'product', productId } = {}) => {
  const contentType = contentTypeOf(asset);

  const response = await fetch(asset.uri);
  const blob = await response.blob();

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is too large. Please choose one under 8MB.');
  }

  const authorization = await uploads.authorize(businessId, {
    purpose,
    contentType,
    sizeBytes: blob.size,
    productId,
  });

  const put = await fetch(authorization.uploadUrl, {
    method: 'PUT',
    // The signature covers these headers; sending anything different invalidates it.
    headers: { ...(authorization.requiredHeaders ?? {}), 'Content-Type': contentType },
    body: blob,
  });

  if (!put.ok) throw new Error('The upload did not complete. Please try again.');

  await uploads.confirm(businessId, {
    uploadId: authorization.uploadId,
    width: asset.width,
    height: asset.height,
  });

  return {
    imageKey: authorization.objectKey,
    publicUrl: authorization.publicUrl,
    width: asset.width,
    height: asset.height,
  };
};

/**
 * The store logo, from photo to saved: pick (free crop — a logo is rarely square), upload,
 * and set it on the store. Returns the saved business, or null when the owner cancelled.
 */
export const pickAndSaveLogo = async (businessId) => {
  const asset = await pickImage({ aspect: null });
  if (!asset) return null;
  const { imageKey } = await uploadImage(businessId, asset, { purpose: 'logo' });
  return businesses.update(businessId, { logoKey: imageKey });
};
