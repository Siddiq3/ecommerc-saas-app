/**
 * The five storefront looks offered at the end of setup, as pure data.
 *
 * Kept free of any React Native import so `scripts/verify-store-styles.mjs` can load it in
 * plain node and check every theme against the schema the API validates with. Re-exported
 * from ./onboarding.js, which is where the rest of the flow's data lives.
 */

/**
 * Each one is a real patch for `PATCH /businesses/:id/settings` — the values are exactly
 * what `themeSchema` accepts, so choosing a style here is not a decoration that gets
 * thrown away: the storefront really renders in it. The card thumbnail and the live preview
 * are both drawn from these same values, so nothing on this screen is a lookalike.
 */
export const STORE_STYLES = [
  {
    id: 'modern',
    label: 'Modern',
    blurb: 'Bold colour, big product cards.',
    theme: { primaryColor: '#E2511E', secondaryColor: '#101014', buttonColor: '#E2511E', buttonTextColor: '#FFFFFF', backgroundColor: '#FFFFFF', fontFamily: 'poppins', layout: 'grid', cornerRadius: 'large' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'Quiet, lots of white space.',
    theme: { primaryColor: '#101014', secondaryColor: '#45454F', buttonColor: '#101014', buttonTextColor: '#FFFFFF', backgroundColor: '#FFFFFF', fontFamily: 'inter', layout: 'grid', cornerRadius: 'small' },
  },
  {
    id: 'fashion',
    label: 'Fashion',
    blurb: 'High contrast, made for outfits.',
    theme: { primaryColor: '#DB2777', secondaryColor: '#101014', buttonColor: '#DB2777', buttonTextColor: '#FFFFFF', backgroundColor: '#FFFFFF', fontFamily: 'dm-sans', layout: 'grid', cornerRadius: 'large' },
  },
  {
    id: 'boutique',
    label: 'Boutique',
    blurb: 'One product at a time, in detail.',
    theme: { primaryColor: '#7C3AED', secondaryColor: '#2A2A31', buttonColor: '#7C3AED', buttonTextColor: '#FFFFFF', backgroundColor: '#FFFFFF', fontFamily: 'dm-sans', layout: 'list', cornerRadius: 'large' },
  },
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Straightforward and familiar.',
    theme: { primaryColor: '#1D4ED8', secondaryColor: '#0F172A', buttonColor: '#1D4ED8', buttonTextColor: '#FFFFFF', backgroundColor: '#FFFFFF', fontFamily: 'system', layout: 'grid', cornerRadius: 'small' },
  },
];

export const styleById = (id) => STORE_STYLES.find((option) => option.id === id);
