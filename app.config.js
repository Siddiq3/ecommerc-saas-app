const { withAndroidManifest } = require('expo/config-plugins');

/**
 * The app is locked to portrait, which makes Android treat a portrait screen as *required* and hides the app from
 * devices that cannot show one (some Chromebooks, desktop mode, XR). Declaring the feature optional keeps the
 * portrait lock on phones and lets those devices install it too. Play Console flags the required form.
 */
const withOptionalPortrait = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    const name = 'android.hardware.screen.portrait';
    const existing = features.find((f) => f.$?.['android:name'] === name);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    return mod;
  });

/**
 * app.json plus one value that must not live in this public repo: the Firebase config for
 * push notifications. Locally it is ./google-services.json (git-ignored); on EAS it comes
 * from the private file variable GOOGLE_SERVICES_JSON (`eas env:create --type file`).
 */
module.exports = ({ config }) =>
  withOptionalPortrait({
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
  });
