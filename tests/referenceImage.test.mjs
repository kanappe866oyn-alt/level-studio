import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceImageSize, prepareReferenceImage } from '../src/core/referenceImage.js';

test('reference sizing preserves portrait/landscape composition without upscaling', () => {
  assert.deepEqual(referenceImageSize(6000, 4000), { width: 2048, height: 1365 });
  assert.deepEqual(referenceImageSize(2000, 4000), { width: 1024, height: 2048 });
  assert.deepEqual(referenceImageSize(800, 600), { width: 800, height: 600 });
  assert.throws(() => referenceImageSize(0, 300));
});

test('large reference conversion preserves alpha formats and releases decoded image on success and failure', async () => {
  let closed = 0, drawn, mime;
  const originalBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 2000, close: () => closed++ });
  const canvas = { getContext: () => ({ drawImage: (...args) => { drawn = args.slice(1); } }),
    toBlob: (done, type) => { mime = type; done(new Blob(['image'], { type })); } };
  const original = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  try {
    const result = await prepareReferenceImage(new Blob(['source'], { type: 'image/png' }));
    assert.equal(result.type, 'image/png'); assert.equal(mime, 'image/png');
    assert.deepEqual(drawn, [0, 0, 2048, 1024]); assert.equal(closed, 1);
    canvas.toBlob = done => done(null);
    await assert.rejects(prepareReferenceImage(new Blob()), /変換/);
    assert.equal(closed, 2);
  } finally {
    if (original === undefined) delete globalThis.document; else globalThis.document = original;
    if (originalBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalBitmap;
  }
});
