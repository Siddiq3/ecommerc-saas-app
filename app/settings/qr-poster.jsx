import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Heading } from '../../src/components/ui.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useT } from '../../src/state/locale.jsx';
import { qrSvg } from '../../src/lib/qr.js';
import { storeUrl } from '../../src/lib/storefront.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * A printable poster with the store's QR code: stick it at the counter or put it in parcels,
 * and walk-in customers become online ones. Made on the phone (PDF), free.
 */

const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const posterHtml = ({ name, url, svg, scan, also }) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: A5; margin: 0; }
  body { margin: 0; font-family: -apple-system, Roboto, 'Noto Sans', sans-serif; color: #101014; }
  .page { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 28px; box-sizing: border-box; border: 14px solid ${colors.accent600}; }
  h1 { font-size: 34px; margin: 0 0 6px; }
  .scan { font-size: 22px; font-weight: 700; color: ${colors.accent600}; margin: 0 0 22px; }
  .qr { width: 62%; max-width: 320px; padding: 16px; background: #fff; border-radius: 16px; border: 2px solid #e6e6ea; }
  .qr svg { width: 100%; height: auto; display: block; }
  .url { font-size: 16px; margin-top: 18px; word-break: break-all; }
  .also { font-size: 13px; color: #55555f; margin-top: 8px; }
</style></head><body><div class="page">
  <h1>${escape(name)}</h1>
  <p class="scan">${escape(scan)}</p>
  <div class="qr">${svg}</div>
  <div class="url">${escape(url.replace(/^https?:\/\//, ''))}</div>
  <div class="also">${escape(also)}</div>
</div></body></html>`;

export default function QrPoster() {
  const t = useT();
  const toast = useToast();
  const { business } = useAuth();
  const url = business?.slug ? storeUrl(business.slug) : null;
  const [svg, setSvg] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (url) qrSvg(url).then(setSvg).catch(() => setSvg(null));
  }, [url]);

  if (!url) return <Screen><Body>{t('Create your store first.')}</Body></Screen>;

  const html = () => posterHtml({
    name: business.name, url, svg, scan: t('Scan to shop online'), also: t('Order anytime · Cash on delivery & UPI'),
  });

  const share = async () => {
    setBusy('share');
    try {
      const { uri } = await Print.printToFileAsync({ html: html() });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('Shop QR poster'), UTI: 'com.adobe.pdf' });
    } catch {
      toast.error(t('Could not create the poster. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    setBusy('print');
    try { await Print.printAsync({ html: html() }); } catch { /* closed the print dialog */ } finally { setBusy(null); }
  };

  return (
    <Screen>
      <Card style={styles.poster}>
        <Heading style={styles.center}>{business.name}</Heading>
        <Body strong style={[styles.center, styles.scan]}>{t('Scan to shop online')}</Body>
        <View style={styles.qr}>{svg ? <SvgXml xml={svg} width="100%" height="100%" /> : null}</View>
        <Caption style={styles.center}>{url.replace(/^https?:\/\//, '')}</Caption>
      </Card>
      <Caption style={styles.tip}>{t('Print it for your shop counter, or put it inside every parcel so customers order again.')}</Caption>
      <Button title={t('Share poster (PDF)')} onPress={share} loading={busy === 'share'} disabled={!svg || Boolean(busy)} />
      <Button title={t('Print')} variant="secondary" onPress={print} loading={busy === 'print'} disabled={!svg || Boolean(busy)} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  poster: { alignItems: 'center', borderWidth: 6, borderColor: colors.accent600, borderRadius: radius.lg, paddingVertical: space.xl },
  center: { textAlign: 'center' },
  scan: { color: colors.accent600, marginTop: space.xs, marginBottom: space.lg },
  qr: { width: 220, height: 220, padding: space.md, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: space.md },
  tip: { textAlign: 'center', marginVertical: space.lg },
});
