import { useEffect, useState } from 'react';
import { BILLING_PLANS } from '@storekit/shared';
import { subscription } from '../api/endpoints.js';

/**
 * The plans on sale, as the server describes them.
 *
 * The app ships with a copy of the plan table, but a copy goes stale the day a price or a
 * feature changes and an old install is still in someone's pocket. So the bundled table only
 * paints the first frame (and covers being offline); the moment the server answers, its
 * version replaces it. What is charged is always decided server-side regardless — this is only
 * about showing the same numbers the checkout will.
 *
 * An answer that does not look like a plan list is ignored rather than trusted.
 */
const looksLikeCatalogue = (plans) =>
  Array.isArray(plans)
  && plans.length > 0
  // `featureList` is what the paywall draws; a server that predates it gets ignored, not crashed on.
  && plans.every((p) => p?.planId && Number.isInteger(p.monthlyPaise) && Array.isArray(p.highlights) && Array.isArray(p.featureList));

export const usePlanCatalogue = () => {
  const [plans, setPlans] = useState(BILLING_PLANS);

  useEffect(() => {
    let cancelled = false;
    subscription
      .plans()
      .then((data) => { if (!cancelled && looksLikeCatalogue(data?.plans)) setPlans(data.plans); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return plans;
};
