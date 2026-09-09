/**
 * Lazy wrapper around the `acj-wasm` module (libjpeg-turbo, compiled by
 * `packages/acj-wasm/build.sh` straight into `./vendor/acj.js`). Instantiated on
 * first real use and reused afterwards; a failed instantiation is not cached.
 *
 * `./vendor/acj.js` is the committed ~300 KB Emscripten build (wasm inlined via
 * -sSINGLE_FILE). It's pulled in with a dynamic import so it only loads the
 * first time an arithmetic JPEG is actually encountered.
 */

import type { ACJModule } from './vendor/acj.js';

let modulePromise: Promise<ACJModule> | null = null;

const loadModule = (): Promise<ACJModule> => {
  if (!modulePromise) {
    modulePromise = import('./vendor/acj.js')
      .then((m) => m.default({ print: () => {}, printErr: () => {} }))
      .catch((err) => {
        modulePromise = null;
        throw err;
      });
  }
  return modulePromise;
};

/**
 * Losslessly transcode an arithmetic-coded JPEG to a baseline Huffman JPEG.
 * Throws if the module is unavailable or libjpeg rejects the input (e.g. SOF11).
 */
export async function transcodeArithmeticJpeg(input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const mod = await loadModule();

  const inPtr = mod._malloc(input.length);
  const outLenPtr = mod._malloc(4);
  let outPtr = 0;
  try {
    mod.HEAPU8.set(input, inPtr);
    outPtr = mod._acj_transcode(inPtr, input.length, outLenPtr);
    if (outPtr === 0) {
      throw new Error('acj_transcode failed (unsupported mode or malformed JPEG)');
    }
    const outLen = mod.HEAPU32[outLenPtr >>> 2]!;
    // Copy out of the wasm heap before it is freed / can grow.
    return mod.HEAPU8.slice(outPtr, outPtr + outLen);
  } finally {
    if (outPtr !== 0) mod._free(outPtr);
    mod._free(inPtr);
    mod._free(outLenPtr);
  }
}

/** Test/diagnostic hook — drop the cached module so the next call re-instantiates. */
export function resetArithmeticJpegModule(): void {
  modulePromise = null;
}
