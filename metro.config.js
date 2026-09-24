// The app is its own repository: the @storekit/* packages are npm workspaces inside it
// (packages/), so they are already under the project root and Metro needs no extra watch
// folders or resolver paths — the default config finds them through node_modules.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
