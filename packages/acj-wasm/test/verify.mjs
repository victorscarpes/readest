/*
 * Post-build check for the committed acj-wasm module. Run after build.sh:
 *
 *   node packages/acj-wasm/test/verify.mjs [sample.jpg]
 *
 * Asserts the transcode is (a) structurally a baseline Huffman JPEG with the
 * arithmetic coding gone, (b) coefficient-preserving — identical DQT and SOF
 * component geometry, so the dequantised coefficients (hence pixels) match, and
 * (c) deterministic / idempotent. If ImageMagick's `magick` is on PATH it also
 * does a hard pixel-equality comparison.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import createACJModule from '../../../apps/readest-app/src/services/acj/vendor/acj.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(here, '../../../apps/readest-app/src/__tests__/fixtures/acj/p0000-arith-sof10.jpg');

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`ok  - ${msg}`);
};

/** Collect the payloads of a given marker (0xFFxx) up to SOS. */
function segments(bytes, want) {
  const out = [];
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    i += 2;
    if (marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda) break;
    const len = (bytes[i] << 8) | bytes[i + 1];
    if (marker === want) out.push(Buffer.from(bytes.slice(i + 2, i + len)));
    i += len;
  }
  return out;
}
const sofMarker = (bytes) => {
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const m = bytes[i + 1];
    i += 2;
    if (m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    if (m === 0xda) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return m;
    i += (bytes[i] << 8) | bytes[i + 1];
  }
  return null;
};

const mod = await createACJModule({ print() {}, printErr() {} });

function transcode(input) {
  const inPtr = mod._malloc(input.length);
  const outLenPtr = mod._malloc(4);
  try {
    mod.HEAPU8.set(input, inPtr);
    const outPtr = mod._acj_transcode(inPtr, input.length, outLenPtr);
    assert(outPtr !== 0, 'acj_transcode returned non-NULL');
    const outLen = mod.HEAPU32[outLenPtr >>> 2];
    const out = mod.HEAPU8.slice(outPtr, outPtr + outLen);
    mod._free(outPtr);
    return out;
  } finally {
    mod._free(inPtr);
    mod._free(outLenPtr);
  }
}

const src = new Uint8Array(readFileSync(samplePath));
console.log(`sample: ${samplePath} (${src.length} bytes, SOF 0x${sofMarker(src).toString(16)})`);
assert([0xc9, 0xca, 0xcb].includes(sofMarker(src)), 'sample really is an arithmetic JPEG');

const out = transcode(src);
assert(out[0] === 0xff && out[1] === 0xd8, 'output starts with SOI');
assert([0xc0, 0xc1].includes(sofMarker(out)), `output SOF is baseline Huffman (0x${sofMarker(out).toString(16)})`);

// Compare quantisation *tables* by id, not DQT segment framing — libjpeg may
// split what the source packed into one segment.
const quantTables = (bytes) => {
  const tables = {};
  for (const seg of segments(bytes, 0xdb)) {
    let k = 0;
    while (k < seg.length) {
      const pq = seg[k] >> 4;
      const tq = seg[k] & 0x0f;
      k += 1;
      const n = pq ? 128 : 64;
      tables[tq] = seg.slice(k, k + n);
      k += n;
    }
  }
  return tables;
};
const srcQ = quantTables(src);
const outQ = quantTables(out);
assert(
  Object.keys(srcQ).length > 0 && Object.keys(srcQ).length === Object.keys(outQ).length,
  'same set of quantisation tables',
);
assert(
  Object.keys(srcQ).every((id) => outQ[id] && srcQ[id].equals(outQ[id])),
  'quantisation tables byte-identical (coefficients dequantise the same)',
);

// SOF geometry: skip the marker's 2-byte SOFx, compare from `precision` onward
// minus the marker id difference — components + sampling factors must match.
const geom = (bytes) => {
  const m = sofMarker(bytes);
  let i = 2;
  while (!(bytes[i] === 0xff && bytes[i + 1] === m)) i += 1;
  const len = (bytes[i + 2] << 8) | bytes[i + 3];
  // bytes: precision(1) height(2) width(2) ncomp(1) then ncomp*(id, HV, Tq)
  return Buffer.from(bytes.slice(i + 4, i + 2 + len));
};
assert(geom(src).equals(geom(out)), 'SOF precision/size/components/sampling identical');

const out2 = transcode(out);
assert(Buffer.from(out).equals(Buffer.from(out2)), 'idempotent: transcoding the output is a no-op');

// Optional hard check via ImageMagick: decode both and count differing pixels.
// `magick compare` writes the metric to stderr and exits non-zero when the
// images differ, so read stderr and don't trust the exit code.
const magickAvailable = (() => {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (magickAvailable) {
  const a = resolve(here, '.verify-src.jpg');
  const b = resolve(here, '.verify-out.jpg');
  writeFileSync(a, Buffer.from(src));
  writeFileSync(b, Buffer.from(out));
  // `magick compare` writes the metric to stderr; spawnSync captures it
  // regardless of exit code.
  const r = spawnSync('magick', ['compare', '-metric', 'AE', a, b, 'null:'], { encoding: 'utf8' });
  const ae = String(r.stderr ?? '').trim(); // e.g. "0" or "0 (0)"
  assert(/^0\b/.test(ae), `ImageMagick absolute-error pixel count is 0 (got "${ae}")`);
} else {
  console.log('--  (ImageMagick not on PATH; skipped hard pixel comparison)');
}

console.log('\nALL CHECKS PASSED');
