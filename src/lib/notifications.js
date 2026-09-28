/**
 * Where tapping a notification goes. The API stores the screen as `link` ("/orders/<id>",
 * "/products/<id>"); only those two shapes are followed, so a notification can never send the
 * app somewhere else. Returns null for one with nowhere to go (a domain notice).
 */
const TARGET = /^\/(orders|products)\/[A-Za-z0-9_-]{1,64}$/;

export const notificationTarget = (item) => {
  if (typeof item?.link === 'string' && TARGET.test(item.link)) return item.link;
  if (item?.orderId) return `/orders/${item.orderId}`;
  if (item?.productId) return `/products/${item.productId}`;
  return null;
};
