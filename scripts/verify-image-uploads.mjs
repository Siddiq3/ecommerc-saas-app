import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real upload pipeline with native/file/network boundaries replaced.
const source = readFileSync(new URL('../src/lib/upload.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '').replace(/export /g, '');

const setup = ({ putFails = false, confirmFails = false, cleanupFails = false, tooLarge = false } = {}) => {
  const calls = [];
  const context = {
    MAX_UPLOAD_BYTES: 8 * 1024 * 1024,
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: { manipulate: uri => {
      calls.push(['convert', uri]);
      return {
        resize: size => calls.push(['resize', size]),
        renderAsync: async () => ({ saveAsync: async options => {
          calls.push(['save', options]);
          return { uri: 'file:///converted.jpg', width: 1200, height: 1600 };
        } }),
      };
    } },
    deleteAsync: async uri => {
      calls.push(['delete', uri]);
      if (cleanupFails) throw new Error('cleanup failed');
    },
    fetch: async (url, options) => {
      calls.push(['fetch', url, options]);
      return options ? { ok: !putFails } : { blob: async () => ({ size: tooLarge ? 9 * 1024 * 1024 : 1024 }) };
    },
    uploads: {
      authorize: async (id, payload) => {
        calls.push(['authorize', id, payload]);
        return { uploadUrl: 'https://storage.invalid/upload', uploadId: 'upload', objectKey: 'image', publicUrl: 'https://storage.invalid/image' };
      },
      confirm: async (id, payload) => {
        calls.push(['confirm', id, payload]);
        if (confirmFails) throw new Error('confirm failed');
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.upload = uploadImage;', context);
  return { upload: context.upload, calls };
};

for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
  const { upload, calls } = setup();
  await upload('business', { uri: 'file:///original', mimeType, width: 400, height: 300 });
  assert(!calls.some(c => c[0] === 'convert' || c[0] === 'delete'));
  assert.equal(calls.find(c => c[0] === 'authorize')[2].contentType, mimeType);
}

for (const mimeType of ['image/heic', 'image/avif', 'image/tiff', undefined]) {
  const { upload, calls } = setup();
  const result = await upload('business', { uri: 'file:///original.heic', mimeType, width: 3024, height: 4032 }, { purpose: 'logo' });
  assert(calls.some(c => c[0] === 'convert'));
  assert.equal(calls.find(c => c[0] === 'resize')[1].height, 1600);
  assert.equal(calls.find(c => c[0] === 'authorize')[2].contentType, 'image/jpeg');
  assert.equal(calls.find(c => c[0] === 'authorize')[2].purpose, 'logo');
  assert(calls.some(c => c[0] === 'fetch' && c[1] === 'file:///converted.jpg'));
  assert.equal(calls.find(c => c[0] === 'fetch' && c[2])[2].headers['Content-Type'], 'image/jpeg');
  assert.equal(result.width, 1200);
  assert.equal(result.height, 1600);
  assert.equal(calls.at(-1)[0], 'delete');
}

for (const failure of ['putFails', 'confirmFails', 'tooLarge']) {
  const { upload, calls } = setup({ [failure]: true });
  await assert.rejects(upload('business', { uri: 'file:///original.heic', mimeType: 'image/heic' }));
  assert.equal(calls.at(-1)[0], 'delete');
  if (failure === 'tooLarge') assert(!calls.some(c => c[0] === 'authorize'));
}
const cleanup = setup({ cleanupFails: true });
assert.equal((await cleanup.upload('business', { uri: 'file:///original.heic' })).imageKey, 'image');
console.log('✓ Image uploads preserve JPEG/PNG/WebP, convert iPhone formats before authorization, and clean up on success or failure.');
