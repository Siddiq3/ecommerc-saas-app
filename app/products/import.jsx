import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, deleteAsync, downloadAsync, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { MAX_UPLOAD_BYTES, getPlan } from '@storeflick/shared';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Card, Divider, Heading } from '../../src/components/ui.jsx';
import { ProgressBar } from '../../src/components/motion.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePlan } from '../../src/state/plan.jsx';
import { useT } from '../../src/state/locale.jsx';
import { categories as categoriesApi, products as productsApi, uploads as uploadsApi } from '../../src/api/endpoints.js';
import { prepareImage, putToStorage } from '../../src/lib/upload.js';
import { MAX_PHOTOS, MAX_PRODUCTS, TEMPLATE_CSV, groupsOf, readProductFile } from '../../src/lib/productImport.js';
import { msg } from '../../src/lib/i18n.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Import products from a CSV file: a Shopify or WooCommerce product export, or StoreFlick's template.
 *
 * Read and checked on the phone first (a preview with every problem), then created in groups of up to 25: each group
 * is a handful of server calls (authorize its photos, confirm them, create its products), not one per product and two
 * per photo. Photos are downloaded from the old website's links onto the phone and sent straight to storage, so the
 * server never fetches a link from a file. Products already in the store (same name) are skipped, so running a file
 * again after a stop carries on where it left off.
 */
const FORMAT_LABELS = { shopify: 'Shopify', woocommerce: 'WooCommerce', template: msg('StoreFlick template') };
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `task` over `items`, at most `limit` at a time. */
const inPool = async (items, limit, task) => {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next; next += 1; await task(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

export default function ImportProducts() {
  const t = useT();
  const navigation = useNavigation();
  const { businessId } = useAuth();
  const { status } = usePlan();
  const photoLimit = Math.min(MAX_PHOTOS, getPlan(status?.planId).maxImagesPerProduct ?? MAX_PHOTOS);

  const [stage, setStage] = useState('start'); // start | reading | preview | importing | done
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null); // { name, result }
  const [progress, setProgress] = useState({ done: 0, current: '', waiting: false });
  const [report, setReport] = useState(null); // { added, photosMissed, failed: [{ name, message }] }
  const stop = useRef(false);

  /** Every product name already in the store, lower case, so the same product is not added twice. */
  const existingNames = async () => {
    const names = new Set();
    let cursor;
    do {
      const page = await productsApi.list(businessId, { limit: 100, cursor, active: 'all' });
      page.items.forEach((p) => names.add(String(p.name).toLowerCase()));
      cursor = page.nextCursor;
    } while (cursor);
    return names;
  };

  const pick = async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    if (/\.xlsx?$/i.test(asset.name ?? '')) { setError(t('This is an Excel file. In Excel, choose Save As and pick CSV, then import that file.')); return; }
    setStage('reading');
    try {
      const text = await readAsStringAsync(asset.uri);
      const result = readProductFile(text, await existingNames());
      if (result.error) {
        setError(result.error === 'too_many'
          ? t('This file has {n} products. Import up to {max} at a time: split the file into parts.', { n: result.count, max: MAX_PRODUCTS })
          : t('We could not read this file. Use a product export from Shopify or WooCommerce, or the StoreFlick template.'));
        setStage('start');
        return;
      }
      setFile({ name: asset.name, result });
      setStage('preview');
    } catch (e) {
      setError(e?.message ?? t('We could not read this file.'));
      setStage('start');
    }
  };

  const shareTemplate = async () => {
    const uri = `${cacheDirectory}storeflick-products-template.csv`;
    await writeAsStringAsync(uri, TEMPLATE_CSV);
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: t('Product template'), UTI: 'public.comma-separated-values-text' });
  };

  /** Calls the API, waiting and trying again while the server says "too many requests". */
  const withWait = async (call) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call();
      } catch (e) {
        if (e?.status !== 429 || attempt >= 20 || stop.current) throw e;
        setProgress((p) => ({ ...p, waiting: true }));
        await pause(30_000);
        setProgress((p) => ({ ...p, waiting: false }));
      }
    }
  };

  /** A photo link → a local file and its type, or null when it cannot be fetched (missing, not an image). */
  const downloadPhoto = async (url, n) => {
    const dest = `${cacheDirectory}import-${Date.now()}-${n}`;
    try {
      const got = await downloadAsync(url, dest);
      // Header names vary in case between servers; some CDNs send photos as a generic binary type, so the link's
      // extension decides then. The server checks the stored type again when the upload is confirmed.
      const header = Object.entries(got.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
      const sent = String(header ?? '').split(';')[0].trim().toLowerCase();
      const ext = url.split(/[?#]/)[0].split('.').pop().toLowerCase();
      const type = sent.startsWith('image/') ? sent : Object.keys(MIME_EXT).find((m) => MIME_EXT[m] === (ext === 'jpeg' ? 'jpg' : ext));
      if (got.status !== 200 || !type) { deleteAsync(dest, { idempotent: true }).catch(() => undefined); return null; }
      return { uri: got.uri, mimeType: type, fileName: `photo.${MIME_EXT[type] ?? 'jpg'}` };
    } catch {
      deleteAsync(dest, { idempotent: true }).catch(() => undefined);
      return null;
    }
  };

  /**
   * One group's photos, uploaded with two server calls whatever their number: authorize all, send each straight to
   * storage, confirm all. Returns, per product, the images that made it, and how many did not.
   */
  const uploadGroupPhotos = async (group) => {
    const photos = []; // { product, sortOrder, file, prepared }
    await inPool(group.flatMap((item, product) => item.images.slice(0, photoLimit).map((url, sortOrder) => ({ url, product, sortOrder }))), 4,
      async ({ url, product, sortOrder }, n) => {
        const file = await downloadPhoto(url, n);
        if (!file) return;
        try {
          const prepared = await prepareImage(file);
          if (prepared.sizeBytes > 0 && prepared.sizeBytes <= MAX_UPLOAD_BYTES) photos.push({ product, sortOrder, file, prepared });
          else await prepared.cleanup();
        } catch { /* not a readable image */ }
      });
    const wanted = group.reduce((sum, item) => sum + Math.min(item.images.length, photoLimit), 0);
    const images = group.map(() => []);
    try {
      if (photos.length) {
        const { items: auth } = await withWait(() => uploadsApi.authorizeBatch(businessId, photos.map((ph) => ({
          purpose: 'product', contentType: ph.prepared.contentType, sizeBytes: ph.prepared.sizeBytes,
        }))));
        const sent = [];
        await inPool(photos.map((ph, i) => ({ ph, a: auth[i] })), 4, async ({ ph, a }) => {
          try { await putToStorage(a, ph.prepared.blob, ph.prepared.contentType); sent.push({ ph, a }); } catch { /* counted as missed */ }
        });
        if (sent.length) {
          const { items: done } = await withWait(() => uploadsApi.confirmBatch(businessId, sent.map(({ ph, a }) => ({
            uploadId: a.uploadId, ...(ph.prepared.width ? { width: ph.prepared.width, height: ph.prepared.height } : {}),
          }))));
          sent.forEach(({ ph, a }, i) => {
            if (done[i]?.ok) images[ph.product].push({ imageKey: a.objectKey, sortOrder: ph.sortOrder });
          });
        }
      }
    } catch { /* storage full or offline: the products still go in, without these photos */ }
    for (const ph of photos) { ph.prepared.cleanup(); deleteAsync(ph.file.uri, { idempotent: true }).catch(() => undefined); }
    images.forEach((list) => list.sort((a, b) => a.sortOrder - b.sortOrder).forEach((img, i) => { img.sortOrder = i; }));
    return { images, missed: wanted - images.reduce((sum, list) => sum + list.length, 0) };
  };

  const run = async () => {
    const { ready } = file.result;
    stop.current = false;
    setStage('importing');
    setProgress({ done: 0, current: '', waiting: false });
    const failed = [];
    let added = 0;
    let photosMissed = 0;

    // Categories by name: the store's own first, new ones made once and reused.
    const categoryIds = new Map();
    try {
      const list = await categoriesApi.list(businessId);
      list.items.forEach((c) => categoryIds.set(c.name.toLowerCase(), c.categoryId));
    } catch { /* products go in without a category */ }
    const categoryFor = async (name) => {
      if (!name) return null;
      const key = name.toLowerCase();
      if (!categoryIds.has(key)) {
        try {
          const made = await withWait(() => categoriesApi.create(businessId, { name }));
          categoryIds.set(key, made.categoryId);
        } catch {
          categoryIds.set(key, null); // the plan's category limit, say: the product still goes in
        }
      }
      return categoryIds.get(key);
    };

    for (const group of groupsOf(ready)) {
      if (stop.current) break;
      setProgress({ done: added + failed.length, current: group[0].input.name, waiting: false });
      const { images, missed } = await uploadGroupPhotos(group);
      photosMissed += missed;
      const products = [];
      for (const [i, item] of group.entries()) {
        const categoryId = await categoryFor(item.category);
        products.push({ ...item.input, images: images[i], ...(categoryId ? { categoryId } : {}) });
      }
      try {
        const { results } = await withWait(() => productsApi.createBatch(businessId, products));
        results.forEach((r, i) => {
          if (r.ok) added += 1;
          else failed.push({ name: group[i].input.name, message: r.error?.message ?? t('Could not be added') });
        });
      } catch (e) {
        group.forEach((item) => failed.push({ name: item.input.name, message: e?.message ?? t('Could not be added') }));
      }
    }
    setProgress((p) => ({ ...p, done: added + failed.length }));
    setReport({ added, photosMissed, failed, stopped: stop.current });
    setStage('done');
  };

  // No swipe or header back while products are being added: leaving would stop the import half way.
  const busy = stage === 'importing';
  useEffect(() => { navigation.setOptions({ gestureEnabled: !busy, headerBackVisible: !busy }); }, [navigation, busy]);

  return (
    <Screen>
      {stage === 'start' || stage === 'reading' ? (
        <>
          <Card style={styles.card}>
            <Heading>{t('Bring your products from another website')}</Heading>
            <Caption style={styles.gap}>{t('Download your products as a CSV file from your old website, then pick that file here. Names, prices, stock, sizes and colours, categories and photos come across.')}</Caption>
            <Step n="1" title="Shopify" text={t('Products → Export → All products → CSV')} />
            <Step n="2" title="WooCommerce" text={t('Products → Export → Generate CSV')} />
            <Step n="3" title={t('Other website or an Excel list')} text={t('Fill in our template (one product per row, photo links optional) and save it as CSV.')} />
            <Caption style={styles.gap}>{t('On a computer? Send the file to yourself on WhatsApp and open it on this phone.')}</Caption>
          </Card>
          <Alert message={error} />
          <Button title={stage === 'reading' ? t('Reading the file…') : t('Choose CSV file')} loading={stage === 'reading'}
            icon={<Ionicons name="document-text-outline" size={18} color="#ffffff" />} onPress={() => pick().catch(() => setStage('start'))} />
          <Button title={t('Get the template')} variant="secondary" style={styles.gap}
            icon={<Ionicons name="download-outline" size={18} color={colors.ink900} />} onPress={() => shareTemplate().catch(() => undefined)} />
        </>
      ) : null}

      {stage === 'preview' ? (
        <>
          <Card style={styles.card}>
            <Caption>{file.name} · {file.result.format === 'template' ? t(FORMAT_LABELS.template) : FORMAT_LABELS[file.result.format]}</Caption>
            <Heading style={styles.gap}>{t(file.result.ready.length === 1 ? '{n} product ready to import' : '{n} products ready to import', { n: file.result.ready.length })}</Heading>
            {file.result.already ? <Caption style={styles.gap}>{t('{n} already in your store: skipped', { n: file.result.already })}</Caption> : null}
            <Caption style={styles.gap}>{t('Up to {n} photos per product are copied from the old website. Keep this screen open while it runs.', { n: photoLimit })}</Caption>
          </Card>
          {file.result.problems.length ? (
            <Card padded={false} style={styles.card}>
              <View style={styles.problemHead}>
                <Ionicons name="warning-outline" size={18} color={colors.danger} />
                <Body strong style={{ color: colors.danger }}>{t(file.result.problems.length === 1 ? '{n} row cannot be imported' : '{n} rows cannot be imported', { n: file.result.problems.length })}</Body>
              </View>
              {file.result.problems.slice(0, 50).map((p, i) => (
                <View key={`${p.row}-${i}`}>
                  <Divider />
                  <View style={styles.problem}>
                    <Body numberOfLines={1}>{t('Row {row}', { row: p.row })}{p.name ? ` · ${p.name}` : ''}</Body>
                    <Caption>{t(p.message)}</Caption>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          <Button title={t(file.result.ready.length === 1 ? 'Import {n} product' : 'Import {n} products', { n: file.result.ready.length })} disabled={!file.result.ready.length} onPress={run} />
          <Button title={t('Choose another file')} variant="secondary" style={styles.gap} onPress={() => { setFile(null); setStage('start'); }} />
        </>
      ) : null}

      {stage === 'importing' ? (
        <Card style={styles.card}>
          <Heading>{t('Importing {done} of {total}', { done: progress.done, total: file.result.ready.length })}</Heading>
          <ProgressBar value={file.result.ready.length ? progress.done / file.result.ready.length : 0} style={styles.bar} />
          <Caption numberOfLines={1}>{progress.waiting ? t('Waiting a moment before the next photos…') : progress.current}</Caption>
          <Caption style={styles.gap}>{t('Keep this screen open. If it stops, import the same file again: products already added are skipped.')}</Caption>
          <Button title={t('Stop')} variant="secondary" style={styles.gap} onPress={() => { stop.current = true; }} />
        </Card>
      ) : null}

      {stage === 'done' && report ? (
        <>
          <Card style={styles.card}>
            <Ionicons name={report.failed.length ? 'alert-circle' : 'checkmark-circle'} size={40} color={report.failed.length ? colors.danger : colors.success} />
            <Heading style={styles.gap}>{t(report.added === 1 ? '{n} product added' : '{n} products added', { n: report.added })}</Heading>
            {report.stopped ? <Caption style={styles.gap}>{t('Stopped. Import the same file again to add the rest.')}</Caption> : null}
            {report.photosMissed ? <Caption style={styles.gap}>{t(report.photosMissed === 1 ? '{n} photo could not be copied. Add it from the product page.' : '{n} photos could not be copied. Add them from the product page.', { n: report.photosMissed })}</Caption> : null}
          </Card>
          {report.failed.length ? (
            <Card padded={false} style={styles.card}>
              {report.failed.slice(0, 50).map((f, i) => (
                <View key={`${f.name}-${i}`}>
                  {i ? <Divider /> : null}
                  <View style={styles.problem}>
                    <Body numberOfLines={1}>{f.name}</Body>
                    <Caption>{f.message}</Caption>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}
          <Button title={t('Done')} onPress={() => navigation.goBack()} />
        </>
      ) : null}
    </Screen>
  );
}

const Step = ({ n, title, text }) => (
  <View style={styles.step}>
    <View style={styles.stepNo}><Caption style={styles.stepNoText}>{n}</Caption></View>
    <View style={{ flex: 1 }}>
      <Body strong>{title}</Body>
      <Caption>{text}</Caption>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  gap: { marginTop: space.sm },
  bar: { marginVertical: space.md },
  step: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  stepNo: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { color: colors.accent700, fontWeight: '600' },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  problem: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2 },
});
