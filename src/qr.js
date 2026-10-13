import QRCode from 'qrcode';
const cache = new Map();
export async function qrCode(url) {
  if (!cache.has(url)) cache.set(url, QRCode.toString(url, { type: 'svg', width: 520, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }));
  return cache.get(url);
}
