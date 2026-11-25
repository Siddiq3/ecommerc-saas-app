import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeItemCode } from '@storeflick/shared';
import { itemTotal, itemsTotal } from '@storeflick/validation';
import { Body, Button, Caption, Row, Touchable } from './ui.jsx';
import { CodeNotFound, formatQty } from './BillItems.jsx';
import { products } from '../api/endpoints.js';
import { addOrIncrement, cooldown, lineFor, lookupCode } from '../lib/productCache.js';
import { formatMoney } from '../lib/format.js';
import { useAuth } from '../state/auth.jsx';
import { useBook } from '../state/book.jsx';
import { useT } from '../state/locale.jsx';
import { colors, fonts, radius, space, type } from '../theme.js';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'];
const beep = require('../../assets/sounds/beep.wav');

/**
 * Scan billing: the phone's camera as the shop's barcode scanner. It stays open; every code seen puts its item on the
 * bill (or one more of it), with a beep and a tap. The same code is taken once per 1.2 s, so holding an item in view
 * adds it once. The list below the camera is the bill's own list, editable here, and Done goes back to the bill.
 *
 * Codes are found in the phone's products copy first, so it works with no internet (src/lib/productCache.js).
 */
export const Scanner = ({ visible, items, onItems, onClose, onTypeItem, onNewProduct }) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { businessId } = useAuth();
  const { db } = useBook() ?? {};
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [note, setNote] = useState(null); // { added } | { missing, offline } | { needsSize }
  const accept = useRef(cooldown(1200)).current;
  const busy = useRef(false);
  const player = useAudioPlayer(beep);

  useEffect(() => {
    if (!visible) { setTorch(false); setNote(null); }
    else if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);

  const onScanned = async ({ data }) => {
    const code = normalizeItemCode(data);
    if (!code || busy.current || !accept(code)) return;
    busy.current = true;
    try {
      const found = await lookupCode(db, products, businessId, code);
      if (found.row) {
        const line = lineFor(found.row);
        onItems((list) => addOrIncrement(list, line));
        setNote({ added: line.name });
        player.seekTo(0);
        player.play();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        setNote(found.needsSize ? { needsSize: true } : { missing: code, offline: Boolean(found.offline) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      }
    } catch {
      // A failed lookup must not stop the camera: the next scan tries again.
    } finally {
      busy.current = false;
    }
  };

  const changeQty = (i, by) => onItems((list) => list.flatMap((it, n) => {
    if (n !== i) return [it];
    const qty = Number(it.qty) + by;
    return qty > 0 ? [{ ...it, qty }] : [];
  }));

  const count = items.reduce((sum, it) => sum + Number(it.qty), 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={visible ? onScanned : undefined}
          />
        ) : (
          <View style={[styles.ask, { paddingTop: insets.top + 80 }]}>
            <Ionicons name="camera-outline" size={44} color="#ffffff" />
            <Body strong style={styles.askTitle}>{t('Allow the camera to scan barcodes')}</Body>
            <Caption style={styles.askText}>{t('The camera is used only while this screen is open.')}</Caption>
            {permission && !permission.canAskAgain ? (
              <Button title={t('Open settings')} full={false} onPress={() => Linking.openSettings()} />
            ) : (
              <Button title={t('Allow camera')} full={false} onPress={requestPermission} />
            )}
          </View>
        )}

        <Row style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Touchable onPress={onClose} style={styles.round} accessibilityLabel={t('Close scanner')} scaleTo={0.92}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Touchable>
          <Body strong style={styles.title}>{t('Scan items')}</Body>
          <Touchable onPress={() => setTorch((v) => !v)} style={[styles.round, torch && styles.roundOn]} scaleTo={0.92}
            accessibilityLabel={torch ? t('Turn off torch') : t('Turn on torch')}>
            <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={torch ? colors.ink900 : '#ffffff'} />
          </Touchable>
        </Row>

        {permission?.granted ? (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
            <Caption style={styles.aim}>{t('Point the camera at a barcode or QR code')}</Caption>
          </View>
        ) : null}

        <View style={styles.bottom}>
          {note?.missing ? (
            <View style={styles.noteWrap}>
              <CodeNotFound dark code={note.missing} offline={note.offline}
                onNewProduct={() => onNewProduct(note.missing)} onType={onTypeItem} />
            </View>
          ) : null}
          {note?.needsSize ? (
            <View style={[styles.noteWrap, styles.toast]}>
              <Caption style={{ color: '#ffffff' }}>{t('This code is for a product sold in sizes. Add it from My products.')}</Caption>
            </View>
          ) : null}

          <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
            <Row style={styles.sheetHead}>
              <Body strong style={{ flex: 1 }}>{t(count === 1 ? '{n} item' : '{n} items', { n: formatQty(count) })}</Body>
              <Body strong style={type.money}>{formatMoney(itemsTotal(items))}</Body>
            </Row>
            {note?.added ? (
              <Row gap={space.xs} style={styles.added}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                <Caption style={{ color: colors.success, flex: 1 }} numberOfLines={1}>{t('Added: {name}', { name: note.added })}</Caption>
              </Row>
            ) : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {items.map((it, i) => (
                <Row key={`${it.productId ?? 'typed'}-${it.variantId ?? ''}-${i}`} gap={space.sm} style={styles.line}>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{it.name}</Body>
                    <Caption>{formatMoney(itemTotal(it))}</Caption>
                  </View>
                  <Touchable onPress={() => changeQty(i, -1)} style={styles.step} accessibilityLabel={t('One less {name}', { name: it.name })}>
                    <Ionicons name={Number(it.qty) > 1 ? 'remove' : 'trash-outline'} size={18} color={colors.ink800} />
                  </Touchable>
                  <Body strong style={styles.qty}>{formatQty(it.qty)}</Body>
                  <Touchable onPress={() => changeQty(i, 1)} style={styles.step} accessibilityLabel={t('One more {name}', { name: it.name })}>
                    <Ionicons name="add" size={18} color={colors.ink800} />
                  </Touchable>
                </Row>
              ))}
            </ScrollView>
            <Button title={t('Done')} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  ask: { flex: 1, alignItems: 'center', paddingHorizontal: space.xl, gap: space.md },
  askTitle: { color: '#ffffff', fontSize: 18, textAlign: 'center' },
  askText: { color: '#d4d4d8', textAlign: 'center', marginBottom: space.md },
  top: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#ffffff', fontSize: 17 },
  round: {
    width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  roundOn: { backgroundColor: '#ffffff' },
  frameWrap: { position: 'absolute', top: '16%', left: 0, right: 0, alignItems: 'center' },
  frame: { width: '72%', aspectRatio: 1.6, borderRadius: radius.lg, borderWidth: 3, borderColor: '#ffffff' },
  aim: { marginTop: space.md, color: '#ffffff', fontFamily: fonts.semibold, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  noteWrap: { marginHorizontal: space.md, marginBottom: space.sm },
  toast: { padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(24,24,27,0.92)' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg, paddingTop: space.lg,
  },
  sheetHead: { marginBottom: space.xs },
  added: { marginBottom: space.xs },
  list: { maxHeight: 220, marginBottom: space.md },
  line: { alignItems: 'center', paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  step: {
    width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken,
  },
  qty: { minWidth: 28, textAlign: 'center', ...type.money },
});

/** The camera for one code: scans a branded item's barcode into a product's item code field. */
export const ScanOnce = ({ visible, onCode, onClose }) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => {
    if (visible) done.current = false;
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={visible ? ({ data }) => {
              if (done.current || !normalizeItemCode(data)) return;
              done.current = true;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
              onCode(normalizeItemCode(data));
            } : undefined} />
        ) : (
          <View style={[styles.ask, { paddingTop: insets.top + 80 }]}>
            <Ionicons name="camera-outline" size={44} color="#ffffff" />
            <Body strong style={styles.askTitle}>{t('Allow the camera to scan barcodes')}</Body>
            {permission && !permission.canAskAgain ? (
              <Button title={t('Open settings')} full={false} onPress={() => Linking.openSettings()} />
            ) : (
              <Button title={t('Allow camera')} full={false} onPress={requestPermission} />
            )}
          </View>
        )}
        <Row style={[styles.top, { paddingTop: insets.top + space.sm }]}>
          <Touchable onPress={onClose} style={styles.round} accessibilityLabel={t('Close scanner')} scaleTo={0.92}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Touchable>
          <Body strong style={styles.title}>{t('Scan the barcode')}</Body>
          <View style={{ width: 44 }} />
        </Row>
        {permission?.granted ? (
          <View style={styles.frameWrap} pointerEvents="none">
            <View style={styles.frame} />
            <Caption style={styles.aim}>{t('Point the camera at a barcode or QR code')}</Caption>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};
