import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { maybeTranscodeArithmeticJpeg } from '@/services/acj';
import { detectArithmeticJpeg } from '@/services/acj/detect';
import { resetArithmeticJpegModule, transcodeArithmeticJpeg } from '@/services/acj/wasm';

const fixture = (name: string) => readFileSync(resolve(__dirname, '../../fixtures/acj', name));

const arithBytes = fixture('p0000-arith-sof10.jpg');
const baselineBytes = fixture('p0000-baseline.jpg');

// The acj-wasm module ships as a stub until `packages/acj-wasm/build.sh` has
// run. Detect which state we are in so the real-transcode assertions can skip
// themselves when the binary is absent (and run locally / in CI once built).
let wasmReady = false;
beforeAll(async () => {
  resetArithmeticJpegModule();
  try {
    await transcodeArithmeticJpeg(new Uint8Array(arithBytes));
    wasmReady = true;
  } catch {
    wasmReady = false;
  }
});

describe('maybeTranscodeArithmeticJpeg — always-on behaviour', () => {
  it('passes a baseline JPEG straight through (same object)', async () => {
    const input = new Blob([baselineBytes], { type: 'image/jpeg' });
    expect(await maybeTranscodeArithmeticJpeg(input)).toBe(input);
  });

  it('passes a non-JPEG blob straight through', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    expect(await maybeTranscodeArithmeticJpeg(png)).toBe(png);
  });

  it('never throws on an arithmetic JPEG, even if the module is unavailable', async () => {
    const input = new Blob([arithBytes], { type: 'image/jpeg' });
    const out = await maybeTranscodeArithmeticJpeg(input);
    expect(out).toBeInstanceOf(Blob);
    if (!wasmReady) {
      // Graceful fallback: original bytes, untouched.
      expect(out).toBe(input);
    }
  });
});

describe('transcode (requires a built acj-wasm)', () => {
  it('produces a baseline Huffman JPEG with the arithmetic coding removed', async (ctx) => {
    if (!wasmReady) ctx.skip();
    const out = new Uint8Array(await transcodeArithmeticJpeg(new Uint8Array(arithBytes)));
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(detectArithmeticJpeg(out)).toBeNull();
    const sof = findSofMarker(out);
    expect([0xc0, 0xc1]).toContain(sof); // SOF0 / SOF1 — Huffman
    expect(out.byteLength).toBeGreaterThan(arithBytes.byteLength / 4);
    expect(out.byteLength).toBeLessThan(arithBytes.byteLength * 4);
  });

  it('maybeTranscodeArithmeticJpeg yields an image/jpeg blob that renders', async (ctx) => {
    if (!wasmReady) ctx.skip();
    const out = await maybeTranscodeArithmeticJpeg(new Blob([arithBytes], { type: 'image/jpeg' }));
    expect(out.type).toBe('image/jpeg');
    expect(detectArithmeticJpeg(new Uint8Array(await out.arrayBuffer()))).toBeNull();
  });
});

function findSofMarker(bytes: Uint8Array): number | null {
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1]!;
    i += 2;
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0xda) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return marker;
    }
    const segLen = (bytes[i]! << 8) | bytes[i + 1]!;
    if (segLen < 2) return null;
    i += segLen;
  }
  return null;
}
