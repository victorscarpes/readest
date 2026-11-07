#!/usr/bin/env bash
#
# Build the committed acj-wasm module from src/acj_transcode.c + libjpeg-turbo,
# via Emscripten. Output goes straight into the app's source tree — it is
# imported relatively by src/services/acj/wasm.ts, so there is no vendor-copy
# step and no public/ asset.
#
# Run inside the official Emscripten image (no host toolchain needed):
#
#   docker run --rm -v "$PWD/../..":/repo -w /repo/packages/acj-wasm emscripten/emsdk:4.0.9 ./build.sh
#
# Output: apps/readest-app/src/services/acj/vendor/acj.js  (wasm inlined, -sSINGLE_FILE=1)
#
set -euo pipefail

LIBJPEG_TURBO_VERSION="3.1.1"
LIBJPEG_TURBO_URL="https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/${LIBJPEG_TURBO_VERSION}/libjpeg-turbo-${LIBJPEG_TURBO_VERSION}.tar.gz"

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="${ROOT}/build"
SRC="${BUILD}/libjpeg-turbo-${LIBJPEG_TURBO_VERSION}"
JPEG_BUILD="${BUILD}/libjpeg-build"
DIST="${ROOT}/../../apps/readest-app/src/services/acj/vendor"

mkdir -p "${BUILD}" "${DIST}"

# --- fetch libjpeg-turbo -----------------------------------------------------
if [ ! -d "${SRC}" ]; then
  echo ">>> fetching libjpeg-turbo ${LIBJPEG_TURBO_VERSION}"
  curl -fsSL "${LIBJPEG_TURBO_URL}" | tar -xz -C "${BUILD}"
fi

# --- configure + build static libjpeg for wasm -----------------------------
# WITH_ARITH_DEC stays ON (default) — that is the whole point.
# WITH_ARITH_ENC / TurboJPEG / SIMD / shared are all off to keep it small.
echo ">>> configuring libjpeg-turbo"
emcmake cmake -S "${SRC}" -B "${JPEG_BUILD}" -G Ninja \
  -DCMAKE_BUILD_TYPE=MinSizeRel \
  -DENABLE_SHARED=0 \
  -DENABLE_STATIC=1 \
  -DWITH_SIMD=0 \
  -DWITH_TURBOJPEG=0 \
  -DWITH_ARITH_DEC=1 \
  -DWITH_ARITH_ENC=0 \
  -DWITH_JPEG8=1

echo ">>> building libjpeg-turbo"
cmake --build "${JPEG_BUILD}" --target jpeg-static

# --- link the transcoder ---------------------------------------------------
echo ">>> linking acj.js"
emcc "${ROOT}/src/acj_transcode.c" "${JPEG_BUILD}/libjpeg.a" \
  -I"${SRC}/src" -I"${JPEG_BUILD}" \
  -Oz -flto \
  -sSTANDALONE_WASM=0 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sSINGLE_FILE=1 \
  -sENVIRONMENT=web \
  -sFILESYSTEM=0 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=16MB \
  -sEXPORT_NAME=createACJModule \
  -sEXPORTED_FUNCTIONS='_acj_transcode,_malloc,_free' \
  -sEXPORTED_RUNTIME_METHODS='HEAPU8,HEAPU32' \
  -sMALLOC=emmalloc \
  -o "${DIST}/acj.js"

# drop any stray .wasm (SINGLE_FILE inlines it)
rm -f "${DIST}/acj.wasm"

# Neutralise Emscripten's `scriptDirectory = new URL(".", _scriptName).href`.
# With -sSINGLE_FILE the wasm is inlined and scriptDirectory / fetch() are dead
# code, but bundlers (Turbopack, webpack) statically see `new URL(".", ...)` and
# warn "Can't resolve '.'". Replace the literal so the reference disappears.
sed -i 's#scriptDirectory=new URL(".",_scriptName).href#scriptDirectory=""#g' "${DIST}/acj.js"
if grep -q 'new URL(".",_scriptName)' "${DIST}/acj.js"; then
  echo "!!! post-process failed: 'new URL(\".\", _scriptName)' still present" >&2
  exit 1
fi

echo ">>> done: $(du -h "${DIST}/acj.js" | cut -f1)  ${DIST}/acj.js"
