/** Crop coordinates shared by the preview and the exported image. Offsets are fractions
 * of the available travel, so the crop stays in place when the device rotates. */
export const photoCrop = (width, height, zoom = 1, offset = { x: 0, y: 0 }) => {
  const size = Math.max(1, Math.floor(Math.min(width, height) / Math.max(1, zoom)));
  const travelX = width - size;
  const travelY = height - size;
  return {
    originX: Math.round(travelX * (1 - Math.max(-1, Math.min(1, offset.x))) / 2),
    originY: Math.round(travelY * (1 - Math.max(-1, Math.min(1, offset.y))) / 2),
    width: size,
    height: size,
  };
};
