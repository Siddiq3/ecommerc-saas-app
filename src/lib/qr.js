import QRCode from 'qrcode';

/** QR code as an SVG string (for posters, bills and share images). Generated on the phone, free. */
export const qrSvg = (text) => QRCode.toString(String(text), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#101014', light: '#ffffff' } });
