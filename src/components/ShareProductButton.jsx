import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { formatMoney, discountPercent } from '@storekit/shared';
import { Button } from './ui.jsx';
import { useToast } from './Toast.jsx';
import { useT } from '../state/locale.jsx';
import { qrSvg } from '../lib/qr.js';
import { productUrl } from '../lib/storefront.js';
import { colors, fonts, radius, space } from '../theme.js';

/**
 * "Share" on a product: makes a picture (photo, name, price, QR + link) for WhatsApp Status,
 * groups or Instagram, through the phone's own share sheet. The seller picks where it goes;
 * nothing is sent automatically. The link is copied too, to paste as the caption.
 */
export const ShareProductButton = ({ product, business }) => {
  const t = useT();
  const toast = useToast();
  const card = useRef(null);
  const url = productUrl(business.slug, product);
  const photo = product.images?.[0]?.url ?? product.images?.[0]?.publicUrl;
  const [svg, setSvg] = useState(null);
  const [photoReady, setPhotoReady] = useState(!photo);
  const [busy, setBusy] = useState(false);
  const off = discountPercent(product.price, product.mrp);

  useEffect(() => { qrSvg(url).then(setSvg).catch(() => setSvg(null)); }, [url]);

  const share = async () => {
    setBusy(true);
    try {
      await Clipboard.setStringAsync(`${product.name} – ${formatMoney(product.price)}\n${url}`);
      const uri = await captureRef(card, { format: 'jpg', quality: 0.92, width: 1080 });
      toast.info(t('Link copied. Paste it as the caption.'));
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: product.name, UTI: 'public.jpeg' });
    } catch {
      toast.error(t('Could not create the picture. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        title={t('Share on WhatsApp Status')}
        variant="secondary"
        icon={<Ionicons name="share-social-outline" size={18} color={colors.ink900} />}
        onPress={share}
        loading={busy}
        disabled={!svg || !photoReady}
      />
      {/* Drawn off screen at a fixed size, then photographed into the image that is shared. */}
      <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View ref={card} collapsable={false} style={styles.card}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.photo} onLoadEnd={() => setPhotoReady(true)} />
          ) : null}
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatMoney(product.price)}</Text>
              {off > 0 ? <Text style={styles.mrp}>{formatMoney(product.mrp)}</Text> : null}
              {off > 0 ? <Text style={styles.off}>{t('{n}% off', { n: off })}</Text> : null}
            </View>
            <View style={styles.footer}>
              <View style={styles.qr}>{svg ? <SvgXml xml={svg} width="100%" height="100%" /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.store} numberOfLines={1}>{business.name}</Text>
                <Text style={styles.cta}>{t('Scan to order')}</Text>
                <Text style={styles.url} numberOfLines={2}>{url.replace(/^https?:\/\//, '')}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  card: { width: 360, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 6, borderColor: colors.accent600 },
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.canvas },
  body: { padding: space.lg },
  name: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.ink900 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xs },
  price: { fontFamily: fonts.bold, fontSize: 26, color: colors.accent600 },
  mrp: { fontSize: 16, color: colors.ink500, textDecorationLine: 'line-through' },
  off: { fontFamily: fonts.semibold, fontSize: 15, color: colors.success },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  qr: { width: 84, height: 84 },
  store: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink900 },
  cta: { fontSize: 14, color: colors.accent600, marginTop: 2 },
  url: { fontSize: 12, color: colors.ink500, marginTop: 2 },
});
