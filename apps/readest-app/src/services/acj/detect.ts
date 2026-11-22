/**
 * Cheap scan of a JPEG's segment markers to spot arithmetic entropy coding.
 *
 * JPEG entropy coding is either Huffman (SOF0/1/2, universally supported) or
 * arithmetic (SOF9/10/11). Webviews decode only the Huffman variants, so an
 * arithmetic frame has to be transcoded before it can be shown.
 *
 * Only segment headers are walked (a few bytes each) up to the first SOS, so
 * this is effectively free for the overwhelmingly common non-arithmetic case.
 */

export type ArithmeticJpegKind =
  | 'sof9' // extended sequential DCT, arithmetic
  | 'sof10' // progressive DCT, arithmetic  (mozjpeg `jpegtran -arithmetic` / FileOptimizer)
  | 'sof11'; // lossless, arithmetic  (not DCT — coefficient transcode cannot handle it)

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const TEM = 0x01;

/**
 * @returns which arithmetic SOF the stream uses, or `null` if it is not an
 *          arithmetic JPEG (including: not a JPEG at all, or truncated).
 */
export function detectArithmeticJpeg(bytes: Uint8Array): ArithmeticJpegKind | null {
  const n = bytes.length;
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;

  let i = 2;
  while (i + 3 < n) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    // Collapse fill bytes (0xFF 0xFF ... 0xFF marker).
    let marker = bytes[i + 1]!;
    while (marker === 0xff && i + 2 < n) {
      i += 1;
      marker = bytes[i + 1]!;
    }
    i += 2;

    // Standalone markers carry no length payload.
    if (
      marker === SOI ||
      marker === EOI ||
      marker === TEM ||
      (marker >= 0xd0 && marker <= 0xd7) // RSTn
    ) {
      continue;
    }

    if (marker === SOS) return null; // reached entropy data without an arithmetic SOF
    if (marker === 0xc9) return 'sof9';
    if (marker === 0xca) return 'sof10';
    if (marker === 0xcb) return 'sof11';

    if (i + 2 > n) break;
    const segLen = (bytes[i]! << 8) | bytes[i + 1]!;
    if (segLen < 2) break; // malformed
    i += segLen;
  }
  return null;
}

/** Fast path: does this look like a JPEG at all (SOI + a marker)? */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === SOI && bytes[2] === 0xff;
}
