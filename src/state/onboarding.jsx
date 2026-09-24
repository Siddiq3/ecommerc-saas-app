import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Everything the merchant has told us during setup, held above the navigator.
 *
 * Setup is a stack of separate screens, and going back pops one off — so answers cannot live
 * in a screen's own state or they would vanish the moment it unmounted. They live here
 * instead, which is what makes "back" show exactly what was typed. It sits in the root
 * layout rather than inside the onboarding group because the first two steps (account and
 * code) belong to the auth group.
 *
 * In memory only. The password is in here until the account is verified, and nothing in
 * this object is worth writing to disk: a killed app restarts setup at the first question
 * the server does not already know the answer to.
 */

const initial = {
  account: { name: '', email: '', phone: '', password: '', confirm: '' },
  /**
   * A fingerprint of the account values already sent to the API. Going back from the code
   * screen and pressing Continue again must not sign up the same person twice — the server
   * would answer "email already registered" to a request that only needed to move forward.
   */
  submittedAccount: null,
  categoryId: null,
  /** Which of STORE_STYLES the storefront is built in. Pre-picked so step 4 opens on a
   *  living preview rather than an empty screen; Continue is still the merchant's. */
  styleId: 'modern',
  business: { name: '', slug: '', slugEdited: false, phone: '', address: '', city: '', state: '', pincode: '' },
  /**
   * Progress of the create call, kept here so the creation screen can be retried without
   * repeating what already succeeded. `POST /businesses` is not repeatable — a second call
   * is refused because the owner already has a store.
   */
  created: { business: null, contactSaved: false, themeSaved: false },
};

const OnboardingContext = createContext(null);

export const OnboardingProvider = ({ children }) => {
  const [draft, setDraft] = useState(initial);

  /** Merges `patch` into one section of the draft (or replaces a scalar key). */
  const update = useCallback((key, patch) => {
    setDraft((prev) => ({
      ...prev,
      [key]: patch !== null && typeof patch === 'object' && !Array.isArray(patch) && typeof prev[key] === 'object' && prev[key] !== null
        ? { ...prev[key], ...patch }
        : patch,
    }));
  }, []);

  const reset = useCallback(() => setDraft(initial), []);

  const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside <OnboardingProvider>');
  return ctx;
};
