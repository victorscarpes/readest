/**
 * Arithmetic-coded JPEG (ACJ) compatibility.
 *
 * Webviews (WebView2, WKWebView, WebKitGTK, ...) do not decode arithmetic-coded
 * JPEGs. foliate-js hands EPUB image resources to the webview as `blob:` URLs,
 * so the fix is to intercept the bytes on foliate's `data` transform event and
 * losslessly convert any arithmetic frame to a baseline Huffman JPEG (identical
 * DCT coefficients, just re-entropy-coded) before the blob URL is made.
 *
 * See `FoliateViewer` where `maybeTranscodeArithmeticJpeg` is wired onto
 * `book.transformTarget`.
 */

import { detectArithmeticJpeg, looksLikeJpeg } from './detect';
import { transcodeArithmeticJpeg } from './wasm';

export { detectArithmeticJpeg } from './detect';

/**
 * If `blob` is an arithmetic-coded JPEG, return a baseline-JPEG blob with the
 * same pixels; otherwise (or on any failure) return `blob` unchanged. Never
 * throws — a transcode failure must not break resource loading.
 */
export async function maybeTranscodeArithmeticJpeg(blob: Blob): Promise<Blob> {
  try {
    // foliate sets the media type from the manifest; be lenient when it is
    // absent or generic but bail for anything explicitly non-JPEG.
    if (blob.type && blob.type !== 'image/jpeg' && blob.type !== 'application/octet-stream') {
      return blob;
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!looksLikeJpeg(bytes)) return blob;

    const kind = detectArithmeticJpeg(bytes);
    if (!kind) return blob;

    const baseline = await transcodeArithmeticJpeg(bytes);
    return new Blob([baseline], { type: 'image/jpeg' });
  } catch (err) {
    console.error('[acj] could not transcode arithmetic JPEG; leaving as-is', err);
    return blob;
  }
}
