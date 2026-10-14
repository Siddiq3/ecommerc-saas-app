import { useRef, useState } from 'react';
import { Alert as RNAlert, Image, Modal, PanResponder, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { cacheDirectory, deleteAsync, downloadAsync } from 'expo-file-system/legacy';
import { Alert, Body, Button, Caption, Heading, Row, Touchable } from './ui.jsx';
import { Sheet } from './Sheet.jsx';
import { pickImage, takePhoto, uploadImage } from '../lib/upload.js';
import { photoCrop } from '../lib/productPhoto.js';
import { colors, contentMaxWidth, radius, space } from '../theme.js';

const dimensions = (uri) => new Promise((resolve, reject) => Image.getSize(uri, (width, height) => resolve({ width, height }), reject));
let photoSequence = 0;
const newPhoto = (asset) => ({ id: ++photoSequence, asset, mode: 'cover', zoom: 1, offset: { x: 0, y: 0 }, changed: true });

/** A transactional editor: the product's images only change after Next succeeds. */
export const ProductPhotos = ({ businessId, productId, images, onChange, onBusyChange }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [index, setIndex] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const lock = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const completed = useRef(new Map());
  const current = draft[index];
  const edge = Math.max(120, Math.min(width, contentMaxWidth, height * 0.47));
  const crop = current?.asset.width && current?.asset.height
    ? photoCrop(current.asset.width, current.asset.height, current.zoom, current.offset) : null;
  const scale = crop ? edge / crop.width : 1;
  const hero = images[0]?.publicUrl ?? images[0]?.url;

  const updateCurrent = (patch) => {
    setDraft((prev) => prev.map((photo, i) => i === index ? { ...photo, ...patch, changed: true } : photo));
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: () => cropping && !busy && Boolean(crop),
    onPanResponderGrant: () => { panStart.current = current.offset; },
    onPanResponderMove: (_, gesture) => {
      const travelX = (current.asset.width - crop.width) * scale / 2;
      const travelY = (current.asset.height - crop.height) * scale / 2;
      updateCurrent({ offset: {
        x: travelX ? Math.max(-1, Math.min(1, panStart.current.x + gesture.dx / travelX)) : 0,
        y: travelY ? Math.max(-1, Math.min(1, panStart.current.y + gesture.dy / travelY)) : 0,
      } });
    },
  });

  const setWorking = (value) => {
    lock.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };
  const start = () => {
    completed.current.clear();
    setError(null);
    setIndex(0);
    setCropping(false);
    setDraft(images.map((image) => ({
      id: ++photoSequence,
      saved: image,
      asset: { uri: image.publicUrl ?? image.url, width: image.width, height: image.height },
      mode: 'fit', zoom: 1, offset: { x: 0, y: 0 }, changed: false,
    })));
    if (images.length) setOpen(true);
    else setSourceOpen(true);
  };
  const close = () => {
    if (lock.current) return;
    if (draft.some((photo) => photo.changed) || (open && draft.length !== images.length)) {
      RNAlert.alert('Discard photo changes?', 'Your product photos have not been changed yet.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { setOpen(false); setSourceOpen(false); } },
      ]);
    } else setOpen(false);
  };
  const add = async (source) => {
    if (lock.current || draft.length >= 12) return;
    setSourceOpen(false);
    setError(null);
    setWorking(true);
    try {
      const selected = source === 'camera'
        ? await takePhoto({ allowsEditing: false })
        : await pickImage({ allowsEditing: false, multiple: true, selectionLimit: 12 - draft.length });
      if (!selected) return;
      const assets = (Array.isArray(selected) ? selected : [selected]).slice(0, 12 - draft.length);
      const photos = await Promise.all(assets.map(async (asset) => newPhoto({
        ...asset, ...(!asset.width || !asset.height ? await dimensions(asset.uri) : {}),
      })));
      setDraft((prev) => [...prev, ...photos]);
      setIndex(draft.length);
      setCropping(false);
      setOpen(true);
    } catch (err) {
      setError(err?.message ?? 'That photo could not be opened. Please try again.');
    } finally { setWorking(false); }
  };
  const prepareCrop = async () => {
    if (!current || lock.current) return;
    setWorking(true);
    setError(null);
    try {
      const size = current.asset.width && current.asset.height ? {} : await dimensions(current.asset.uri);
      updateCurrent({ asset: { ...current.asset, ...size }, mode: 'cover' });
      setCropping(true);
    } catch { setError('That photo could not be loaded. Please try again.'); }
    finally { setWorking(false); }
  };
  const remove = () => {
    RNAlert.alert('Remove this photo?', undefined, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setDraft((prev) => prev.filter((_, i) => i !== index));
        setIndex(Math.max(0, Math.min(index, draft.length - 2)));
        setCropping(false);
      } },
    ]);
  };
  const save = async () => {
    if (lock.current) return;
    setWorking(true);
    setError(null);
    try {
      const next = [];
      for (const photo of draft) {
        if (photo.saved && !photo.changed) { next.push(photo.saved); continue; }
        // Cache successful uploads so retrying after a later failure does not upload twice.
        const key = JSON.stringify([photo.id, photo.asset.uri, photo.mode, photo.zoom, photo.offset]);
        if (completed.current.has(key)) { next.push(completed.current.get(key)); continue; }
        let downloaded;
        let rendered;
        try {
          const size = photo.asset.width && photo.asset.height ? photo.asset : await dimensions(photo.asset.uri);
          let uri = photo.asset.uri;
          if (/^https?:/.test(uri)) {
            downloaded = `${cacheDirectory}product-photo-${Date.now()}-${next.length}.jpg`;
            await downloadAsync(uri, downloaded);
            uri = downloaded;
          }
          const context = ImageManipulator.manipulate(uri);
          if (photo.mode === 'cover') context.crop(photoCrop(size.width, size.height, photo.zoom, photo.offset));
          const renderedSize = photo.mode === 'cover' ? photoCrop(size.width, size.height, photo.zoom, photo.offset) : size;
          if (Math.max(renderedSize.width, renderedSize.height) > 1600) {
            context.resize(renderedSize.width >= renderedSize.height ? { width: 1600 } : { height: 1600 });
          }
          rendered = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
          const uploaded = await uploadImage(businessId, { ...rendered, mimeType: 'image/jpeg' }, { purpose: 'product', productId });
          completed.current.set(key, uploaded);
          next.push(uploaded);
        } finally {
          // Best-effort cleanup must never turn a successful upload into a failed edit.
          if (downloaded) await deleteAsync(downloaded, { idempotent: true }).catch(() => undefined);
          if (rendered?.uri) await deleteAsync(rendered.uri, { idempotent: true }).catch(() => undefined);
        }
      }
      onChange(next.map((photo, sortOrder) => ({ ...photo, sortOrder })));
      setOpen(false);
      setSourceOpen(false);
    } catch (err) { setError(err?.message ?? 'Photos could not be uploaded. Please try again.'); }
    finally { setWorking(false); }
  };

  const sourceOptions = (
    <>
      <Touchable disabled={busy} onPress={() => add('camera')} style={styles.sourceRow}>
        <Ionicons name="camera-outline" size={24} color={colors.ink700} /><Body strong>Take a photo</Body>
      </Touchable>
      <Touchable disabled={busy} onPress={() => add('gallery')} style={styles.sourceRow}>
        <Ionicons name="images-outline" size={24} color={colors.ink700} /><Body strong>Choose from gallery</Body>
      </Touchable>
    </>
  );

  return (
    <View style={styles.section}>
      {!open ? <Alert message={error} /> : null}
      <Touchable onPress={start} disabled={busy} accessibilityLabel={hero ? 'Edit product photos' : 'Add product photos'} style={styles.hero}>
        {hero ? (
          <>
            <Image source={{ uri: hero }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
            <View style={styles.heroLabel}><Body strong style={styles.white}>Edit Photos · {images.length}/12</Body></View>
          </>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="camera" size={48} color={colors.ink400} />
            <Heading style={styles.addTitle}>{busy ? 'Opening photos…' : 'Add Photo'}</Heading>
            <Body muted>Tap to add product images</Body>
          </View>
        )}
      </Touchable>
      <Caption style={styles.hint}>Up to 12 photos. The first photo is your store cover.</Caption>
      <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Row style={styles.header}>
            <Touchable onPress={close} disabled={busy} accessibilityLabel="Back to product"><Ionicons name="chevron-back" size={28} color={colors.ink900} /></Touchable>
            <Heading style={styles.headerTitle}>Add Product Photos</Heading>
            <View style={{ width: 44 }} />
          </Row>
          <ScrollView contentContainerStyle={styles.editor}>
            <Body strong style={styles.counter}>{draft.length ? `${index + 1}/${draft.length}` : 'No photos selected'}</Body>
            {current ? (
              <>
                <View style={[styles.preview, { width: edge, height: edge }]} {...pan.panHandlers}>
                  {crop && current.mode === 'cover' ? (
                    <Image source={{ uri: current.asset.uri }} style={{ position: 'absolute', width: current.asset.width * scale, height: current.asset.height * scale, left: -crop.originX * scale, top: -crop.originY * scale }} />
                  ) : <Image source={{ uri: current.asset.uri }} style={StyleSheet.absoluteFillObject} resizeMode={current.mode === 'cover' ? 'cover' : 'contain'} />}
                  {cropping ? <View pointerEvents="none" style={styles.cropFrame} /> : null}
                  <Touchable disabled={busy} onPress={remove} accessibilityLabel="Remove selected photo" style={styles.remove}><Ionicons name="close" size={22} color="#ffffff" /></Touchable>
                  {!cropping ? <Touchable disabled={busy} onPress={prepareCrop} style={styles.cropButton}><Ionicons name="crop-outline" size={24} color="#ffffff" /><Body strong style={styles.white}>Crop</Body></Touchable> : null}
                </View>
                {cropping ? (
                  <View style={styles.controls}>
                    <Caption style={styles.hint}>Drag the photo to position it. Use + and − to zoom.</Caption>
                    <Row style={{ justifyContent: 'center' }}>
                      <Button title="−" accessibilityLabel="Zoom out" variant="secondary" full={false} disabled={busy || current.zoom <= 1} onPress={() => updateCurrent({ zoom: Math.max(1, current.zoom - 0.25) })} />
                      <Caption>{current.zoom.toFixed(2)}×</Caption>
                      <Button title="+" accessibilityLabel="Zoom in" variant="secondary" full={false} disabled={busy || current.zoom >= 4} onPress={() => updateCurrent({ zoom: Math.min(4, current.zoom + 0.25) })} />
                      <Button title="Done" full={false} disabled={busy} onPress={() => setCropping(false)} />
                    </Row>
                  </View>
                ) : (
                  <View style={styles.modes}>
                    {['cover', 'fit'].map((mode) => <Touchable key={mode} disabled={busy} accessibilityLabel={mode === 'cover' ? 'Cover: crop to square' : 'Fit: keep full photo'} accessibilityState={{ selected: current.mode === mode }} onPress={() => mode === 'cover' ? prepareCrop().then(() => setCropping(false)) : updateCurrent({ mode })} style={[styles.mode, current.mode === mode && styles.modeSelected]}><Body strong>{mode === 'cover' ? 'Cover' : 'Fit'}</Body></Touchable>)}
                  </View>
                )}
                <Caption style={styles.hint}>{current.mode === 'fit' ? 'Fit keeps the full photo in its original proportions.' : 'Cover saves the square crop shown above.'}</Caption>
                <ScrollView horizontal contentContainerStyle={styles.thumbnails} showsHorizontalScrollIndicator={false}>
                  {draft.map((photo, i) => <Touchable key={`${photo.asset.uri}-${i}`} disabled={busy} onPress={() => { setIndex(i); setCropping(false); }} accessibilityLabel={`View photo ${i + 1}`} accessibilityState={{ selected: i === index }} style={[styles.thumbnail, i === index && styles.selectedThumbnail]}><Image source={{ uri: photo.asset.uri }} style={styles.thumbnailImage} /><Caption style={styles.thumbnailNumber}>{i + 1}</Caption></Touchable>)}
                </ScrollView>
              </>
            ) : <View style={styles.noPhotos}><Ionicons name="camera-outline" size={48} color={colors.ink400} /><Body muted>Add photos or tap Next to remove all photos.</Body></View>}
            <Alert message={error} />
            {sourceOpen ? <View style={styles.controls}>{sourceOptions}<Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setSourceOpen(false)} /></View> : null}
          </ScrollView>
          <Row style={styles.footer}>
            <Button title="Add More" icon="camera-outline" variant="secondary" disabled={busy || draft.length >= 12} style={{ flex: 1 }} onPress={() => setSourceOpen(true)} />
            <Button title="Next" loading={busy} style={{ flex: 1 }} onPress={save} />
          </Row>
        </View>
      </Modal>
      <Sheet visible={sourceOpen && !open} onClose={() => { if (!busy) setSourceOpen(false); }} title="Add a photo">{sourceOptions}</Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  hero: { width: '100%', aspectRatio: 1, backgroundColor: colors.sunken, borderTopWidth: 1, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.line, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg },
  addTitle: { color: colors.ink500, fontSize: 24, marginTop: space.md },
  heroLabel: { position: 'absolute', bottom: space.md, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radius.lg, padding: space.md },
  hint: { textAlign: 'center', marginVertical: space.md, paddingHorizontal: space.md },
  modal: { flex: 1, backgroundColor: colors.surface },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: space.md },
  headerTitle: { flex: 1, textAlign: 'center' },
  editor: { alignItems: 'center', paddingBottom: space.lg },
  counter: { padding: space.md, fontSize: 22 },
  preview: { overflow: 'hidden', backgroundColor: colors.sunken },
  remove: { position: 'absolute', top: space.md, right: space.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cropButton: { position: 'absolute', bottom: space.md, left: space.md, right: space.md, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radius.lg, padding: space.md, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm },
  white: { color: '#ffffff' },
  cropFrame: { ...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: '#ffffff' },
  controls: { padding: space.md, width: '100%', maxWidth: contentMaxWidth },
  modes: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.lg, padding: 5, marginTop: space.lg, width: '75%', maxWidth: 360 },
  mode: { flex: 1, alignItems: 'center', padding: space.md, borderRadius: radius.md },
  modeSelected: { backgroundColor: colors.surface },
  thumbnails: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  thumbnail: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.md, padding: 2 },
  selectedThumbnail: { borderColor: colors.accent600 },
  thumbnailImage: { width: 58, height: 58, borderRadius: radius.sm },
  thumbnailNumber: { textAlign: 'center' },
  noPhotos: { padding: space.xl, alignItems: 'center', gap: space.md },
  footer: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 48 },
});
