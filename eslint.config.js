const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

/**
 * Lint rules for the app.
 *
 * The one rule with teeth is the import ban at the bottom: it makes the Play billing
 * boundary a build failure rather than a code-review note.
 */
module.exports = [
  {
    files: ['app/**/*.{js,jsx}', 'src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        __DEV__: 'readonly',
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],

      /**
       * The Google Play payment boundary, enforced.
       *
       * Checkout must happen on the website, reached through the device's real browser.
       * A WebView or a payment SDK in this app would put a purchase flow inside the
       * binary, which is what Play's policy forbids and what we told the store we do not
       * do. Adding one has to be a deliberate act, not an autocomplete.
       */
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react-native-webview', message: 'No WebView in this app: checkout must open in the system browser. See src/state/plan.jsx.' },
            { name: 'react-native-razorpay', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: 'razorpay', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: '@cashfreepayments/cashfree-js', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: '@cashfreepayments/cashfree-pg', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: 'react-native-cashfree-pg-sdk', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: '@stripe/stripe-react-native', message: 'No payment SDK in this app. Checkout happens on the website.' },
            { name: 'expo-in-app-purchases', message: 'Billing is handled on the website, not through in-app purchases.' },
            { name: 'react-native-iap', message: 'Billing is handled on the website, not through in-app purchases.' },
          ],
          patterns: [
            { group: ['*webview*', '*WebView*'], message: 'No WebView in this app: checkout must open in the system browser.' },
          ],
        },
      ],

      /** openAuthSessionAsync is a browser we can hand a redirect to — too close to a
       *  checkout surface we control. Only openBrowserAsync is allowed here. */
      'no-restricted-properties': [
        'error',
        {
          object: 'WebBrowser',
          property: 'openAuthSessionAsync',
          message: 'Use WebBrowser.openBrowserAsync for billing, so the browser stays the user\'s own.',
        },
      ],
    },
  },
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**'],
  },
];
