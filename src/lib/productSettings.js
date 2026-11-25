/**
 * Website-only parts of a product. A shop that turned its website off (usage 'books') sells at the counter only, so
 * its product screens leave out photos, "Visible in store", "Feature on the home page" and sharing — and a save sends
 * no visibility fields, so a product keeps whatever it had (it shows again unchanged if the website is turned on).
 *
 * Online visibility never decides what can be billed: a hidden product is still in My products, item codes and the
 * scanner (src/lib/productCache.js), and its stock comes off the same count the website uses.
 */
export const visibilityFields = ({ books, active, featured }) => (books ? {} : { active, featured });
