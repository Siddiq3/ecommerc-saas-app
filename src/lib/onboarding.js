import {
  addressLine, businessName, mobile, pincode, placeName, storeSlug, z,
} from '@storekit/validation';
import { panelTints } from '../theme.js';

export { STORE_STYLES, styleById } from './storeStyles.js';

/**
 * What the guided setup asks, and how each answer maps onto what the API accepts.
 *
 * Nothing here is a second source of truth for a rule: the schemas are built from the same
 * primitives the API validates with.
 */

/** The step counter shown on every screen. The code screen belongs to step 1, and the
 *  creation animation is step 5 — it has no counter of its own, it *is* the fifth step. */
export const TOTAL_STEPS = 5;

/**
 * `category` is the API enum. Two of the cards share one (Accessories files under fashion,
 * Food & Grocery under grocery) because the enum is shared with the backend and a new value
 * there needs a deploy first; `id` is what the card remembers as selected.
 */
export const CATEGORY_OPTIONS = [
  { id: 'fashion', label: 'Clothing & Fashion', icon: 'shirt-outline', category: 'fashion', tint: panelTints.lilac },
  { id: 'jewellery', label: 'Jewellery', icon: 'diamond-outline', category: 'jewellery', tint: panelTints.butter },
  { id: 'beauty', label: 'Cosmetics & Beauty', icon: 'sparkles-outline', category: 'beauty', tint: panelTints.rose },
  { id: 'electronics', label: 'Electronics', icon: 'headset-outline', category: 'electronics', tint: panelTints.sky },
  { id: 'home', label: 'Home & Living', icon: 'home-outline', category: 'home', tint: panelTints.mint },
  { id: 'grocery', label: 'Food & Grocery', icon: 'basket-outline', category: 'grocery', tint: panelTints.peach },
  { id: 'accessories', label: 'Accessories', icon: 'glasses-outline', category: 'fashion', tint: panelTints.lilac },
  { id: 'other', label: 'Other', icon: 'grid-outline', category: 'other', tint: panelTints.sky },
];

export const categoryById = (id) => CATEGORY_OPTIONS.find((option) => option.id === id);

/* ───────────── Validation ───────────── */

export const detailsSchema = z.object({ name: businessName, slug: storeSlug, phone: mobile });

export const locationSchema = z.object({
  address: addressLine(2, 200, 'Address'),
  city: placeName,
  state: placeName,
  pincode,
});
