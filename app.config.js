/**
 * app.json plus one value that must not live in this public repo: the Firebase config for
 * push notifications. Locally it is ./google-services.json (git-ignored); on EAS it comes
 * from the private file variable GOOGLE_SERVICES_JSON (`eas env:create --type file`).
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
