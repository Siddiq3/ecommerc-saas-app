import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * Token storage.
 *
 * Tokens go to the OS keychain (iOS) / EncryptedSharedPreferences (Android) rather than
 * AsyncStorage, which is a world-readable plaintext file on a rooted device. Every read
 * is tolerant of failure: a keychain can be unavailable while the device is locked, and
 * losing a token should log the user out, never crash the app.
 */

const ACCESS = 'sk.accessToken';
const ACCESS_EXPIRY = 'sk.accessTokenExpiresAt';
const REFRESH = 'sk.refreshToken';
const BUSINESS = 'sk.businessId';

const read = async (key) => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const write = async (key, value) => {
  try {
    if (value === null || value === undefined) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, String(value));
  } catch {
    /* Unavailable keychain: the session simply does not survive this restart. */
  }
};

export const loadSession = async () => {
  const [accessToken, accessTokenExpiresAt, refreshToken, businessId] = await Promise.all([
    read(ACCESS),
    read(ACCESS_EXPIRY),
    read(REFRESH),
    read(BUSINESS),
  ]);
  return { accessToken, accessTokenExpiresAt, refreshToken, businessId };
};

export const saveTokens = async (tokens) =>
  Promise.all([
    write(ACCESS, tokens?.accessToken ?? null),
    write(ACCESS_EXPIRY, tokens?.accessTokenExpiresAt ?? null),
    write(REFRESH, tokens?.refreshToken ?? null),
  ]);

export const saveBusinessId = async (businessId) => write(BUSINESS, businessId ?? null);

export const clearSession = async () =>
  Promise.all([write(ACCESS, null), write(ACCESS_EXPIRY, null), write(REFRESH, null), write(BUSINESS, null)]);

const DEVICE = 'sk.deviceId';

/**
 * A random, install-scoped identifier, created on first use.
 *
 * Deliberately not a hardware id: the backend only needs to recognise the same install
 * across logins, and a random value cannot be used to correlate this user with any other
 * app on the device.
 */
export const getDeviceId = async () => {
  const existing = await read(DEVICE);
  if (existing) return existing;

  const bytes = Crypto.getRandomBytes(16);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await write(DEVICE, id);
  return id;
};
