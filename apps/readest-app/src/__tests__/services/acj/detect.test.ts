import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { detectArithmeticJpeg, looksLikeJpeg } from '@/services/acj/detect';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, '../../fixtures/acj', name)));

describe('detectArithmeticJpeg', () => {
  it('flags a real arithmetic (SOF10) JPEG', () => {
    // p0000-arith-sof10.jpg is a FileOptimizer / `mozjpeg jpegtran -arithmetic`
    // output: progressive DCT, arithmetic coding, no DAC segment.
    expect(detectArithmeticJpeg(fixture('p0000-arith-sof10.jpg'))).toBe('sof10');
  });

  it('returns null for a baseline Huffman JPEG', () => {
    expect(detectArithmeticJpeg(fixture('p0000-baseline.jpg'))).toBeNull();
  });

  it('returns null for non-JPEG / truncated / empty input without throwing', () => {
    expect(detectArithmeticJpeg(new Uint8Array())).toBeNull();
    expect(detectArithmeticJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(detectArithmeticJpeg(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull(); // just SOI
  });

  it('synthetic: recognises each arithmetic SOF marker', () => {
    // SOI, APP0 (len 4, 2 payload bytes), SOFx (len 2), SOS
    const build = (sof: number) =>
      new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe0,
        0x00,
        0x04,
        0x00,
        0x00,
        0xff,
        sof,
        0x00,
        0x02,
        0xff,
        0xda,
      ]);
    expect(detectArithmeticJpeg(build(0xc9))).toBe('sof9');
    expect(detectArithmeticJpeg(build(0xca))).toBe('sof10');
    expect(detectArithmeticJpeg(build(0xcb))).toBe('sof11');
    expect(detectArithmeticJpeg(build(0xc0))).toBeNull(); // baseline Huffman SOF
    expect(detectArithmeticJpeg(build(0xc2))).toBeNull(); // progressive Huffman SOF
  });
});

describe('looksLikeJpeg', () => {
  it('matches the JPEG SOI + marker prefix only', () => {
    expect(looksLikeJpeg(fixture('p0000-arith-sof10.jpg'))).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0x00]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(false);
  });
});
