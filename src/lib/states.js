/**
 * India's 28 states and 8 union territories, as the owner picks them for their address.
 * Written with "and" rather than "&": state names are checked as place names (letters, spaces,
 * full stops and hyphens), so every entry here saves as it is.
 */
export const INDIAN_STATES = Object.freeze([
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

/** States whose name contains the search text, ignoring case and extra spaces. */
export const matchStates = (query) => {
  const q = String(query ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return q ? INDIAN_STATES.filter((s) => s.toLowerCase().includes(q)) : INDIAN_STATES;
};

/** The list's spelling of a saved state ("telangana" → "Telangana"), or null if it is not one. */
export const canonicalState = (value) =>
  INDIAN_STATES.find((s) => s.toLowerCase() === String(value ?? '').trim().toLowerCase()) ?? null;
