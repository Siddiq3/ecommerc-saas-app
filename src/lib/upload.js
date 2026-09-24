import * as ImagePicker from 'expo-image-picker';
import { MAX_UPLOAD_BYTES } from '@storekit/shared';
import { uploads } from '../api/endpoints.js';

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

export const pickImage = async () => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    const error = new Error('StoreKit needs access to your photos to add product images.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // Square, because the storefront grid is square and cropping here beats cropping later.
    allowsEditing: true,
    aspect: [1, 1],
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
