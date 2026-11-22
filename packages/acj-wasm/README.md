# acj-wasm

Build source for a tiny WebAssembly module that **losslessly transcodes
arithmetically-coded JPEGs to baseline (Huffman) JPEGs** so they render in any
browser / webview.

Web engines (WebView2, WKWebView, WebKitGTK, Chromium, Firefox, Safari) do not
decode arithmetic-coded JPEGs (SOF9 / SOF10). This module runs the same operation
as `jpegtran`: it decodes the arithmetic entropy stream to DCT coefficients and
re-emits **the identical coefficients** with Huffman coding. No pixel decode, no
re-quantization — the image is bit-exact.

It is built once from **libjpeg-turbo** (arithmetic decoding is `ON` by default)
compiled with Emscripten. The build output is **committed** at
`apps/readest-app/src/services/acj/vendor/acj.js` (wasm inlined via
`-sSINGLE_FILE=1`) and imported relatively by `src/services/acj/wasm.ts`, so the
app needs no C/wasm toolchain and there is no `public/` asset or vendor-copy
step — only regenerating the binary needs Docker.

## API

`vendor/acj.js` is an ES module with a default export: an Emscripten module
factory.

```js
import createACJModule from './vendor/acj.js';
const mod = await createACJModule();
// mod._acj_transcode(inPtr, inLen, outLenPtr) -> outPtr  (see wasm.ts)
```

The single C entry point:

```c
// Returns a malloc'd baseline-JPEG buffer (caller frees via _free); writes its
// length to *outLenPtr. Returns 0 (NULL) on any failure.
uint8_t *acj_transcode(const uint8_t *in, size_t inLen, size_t *outLenPtr);
```

## Rebuilding

Requires Docker (no host Emscripten needed):

```sh
cd packages/acj-wasm
pnpm build        # docker run ... emscripten/emsdk:4.0.9 ./build.sh
pnpm verify       # lossless check on the fixture (needs `magick` on PATH for the pixel test)
```

`build.sh` fetches the pinned libjpeg-turbo, configures it for wasm
(`-DWITH_SIMD=0 -DENABLE_SHARED=0 -DWITH_TURBOJPEG=0 -DWITH_ARITH_ENC=0`,
arithmetic *decode* stays on), builds `libjpeg.a`, links `src/acj_transcode.c`,
and writes `apps/readest-app/src/services/acj/vendor/acj.js`. Commit the result.

`LIBJPEG_TURBO_VERSION` and the `emscripten/emsdk` image tag are pinned at the top
of `build.sh` / in `package.json`; bump them together and re-commit.
