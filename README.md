<div align="center">
  <img src="https://github.com/readest/readest/blob/main/apps/readest-app/src-tauri/icons/icon.png?raw=true" alt="Readest Logo" width="18%" />
  <h1>Readest &nbsp;<sub>(victorscarpes fork)</sub></h1>

[![AGPL Licence](https://img.shields.io/badge/license-AGPL--3.0-teal)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-readest%2Freadest-orange)](https://github.com/readest/readest)
[![Fork sync + release](https://github.com/victorscarpes/readest/actions/workflows/fork-sync-release.yml/badge.svg)](https://github.com/victorscarpes/readest/actions/workflows/fork-sync-release.yml)

</div>

A personal fork of **[readest/readest](https://github.com/readest/readest)** — the
open-source ebook reader. It tracks upstream automatically and changes **two
things**:

### 1. Lossless support for arithmetically-coded JPEGs

Baseline JPEG uses Huffman entropy coding; the standard also allows *arithmetic*
coding (SOF9 / SOF10), which compresses a few percent better but which **no
browser or webview decodes** — Chromium, WebKit and WebView2 all reject it. An
EPUB whose images were optimised that way (e.g. by
[FileOptimizer](https://sourceforge.net/projects/nikkhokkho/) /
`mozjpeg jpegtran -arithmetic`) shows broken-image placeholders in stock Readest.

This fork adds a tiny [libjpeg-turbo](https://libjpeg-turbo.org/) WebAssembly
module that runs the `jpegtran` **coefficient copy**: it re-encodes the
arithmetic entropy stream as Huffman **without touching the DCT coefficients**, so
the output is a byte-for-byte-identical image the webview can display. It runs on
foliate-js's `data` resource hook, lazily (only when an arithmetic JPEG is
actually loaded), on every platform.

Verified on a 192-image manga volume where 191 images were arithmetic-coded: all
transcoded, **zero differing pixels** (ImageMagick `AE` metric).

Source: [`packages/acj-wasm/`](packages/acj-wasm) (build) and
[`apps/readest-app/src/services/acj/`](apps/readest-app/src/services/acj)
(detection + the `data`-event hook).

### 2. Its own Windows build and update channel

| | upstream | this fork |
|---|---|---|
| Product name / bundle id | `Readest` / `com.bilingify.readest` | `Readest (victorscarpes)` / `com.victorscarpes.readest` — installs **alongside** official Readest, separate library & settings |
| Installer | signed, all platforms | **Windows x64 only**, NSIS, **unsigned** (SmartScreen warns on first run) |
| Auto-update source | `download.readest.com` / `readest/readest` releases | **this fork's** [GitHub Releases](https://github.com/victorscarpes/readest/releases), verified with this fork's own key |
| Nightly channel, mobile, macOS, Linux, app stores | yes | not built here |

The in-app updater still works exactly as upstream's — it just points at this
repo. Because the signing key differs, moving between the official app and this
fork is a manual reinstall, not an "update".

## How it stays current

[`.github/workflows/fork-sync-release.yml`](.github/workflows/fork-sync-release.yml)
runs daily. When `readest/readest` publishes a release it: rebuilds this repo's
`main` from that upstream tag, re-applies the arithmetic-JPEG patch (new files
only — it can't conflict) and the identity/updater overrides (anchored,
idempotent), runs lint + the ACJ tests, builds & signs the Windows installer, and
publishes a matching release here. **A `Fork sync failed` issue is opened only if
something needs a human** (an override anchor moved, tests broke, the build
failed).

The entire fork delta lives in **[`fork/`](fork/)** — a patch, a config file, and
one override script — plus this workflow. See [`fork/README.md`](fork/README.md)
for the mechanics and how to recover a failed sync.

> The commit graph is bot-owned and force-pushed each release:
> `<upstream tag>` → `fork-base` (permanent) → `fork: upstream <tag>` →
> `fork: arithmetic-JPEG feature` → `fork: identity + updater`.

## Everything else

Features, screenshots, roadmap, other platforms, documentation, translations,
sync, KOReader, contributing — all unchanged from upstream. See the
**[upstream README](https://github.com/readest/readest#readme)** and
[readest.com/docs](https://readest.com/docs).

## Building from source

Same as upstream (Node 24, `pnpm`, Rust, and the Tauri prerequisites for your
platform), with one extra step to apply the fork delta:

```sh
git clone --recurse-submodules https://github.com/victorscarpes/readest.git
cd readest
pnpm install
node fork/apply-overrides.mjs           # identity + updater + the reader hook
pnpm --filter @readest/readest-app setup-vendors
pnpm --filter @readest/readest-app dev-web     # or: pnpm tauri dev
```

`main` already contains the arithmetic-JPEG feature files; `apply-overrides.mjs`
adds the four one-file edits the workflow would otherwise make. Rebuilding the
WASM module itself needs Docker — see [`packages/acj-wasm/README.md`](packages/acj-wasm/README.md).

## License

This fork, like upstream, is free software under the
[GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0.html)
or later — see [LICENSE](LICENSE). The complete corresponding source is this
repository.

Readest is a modern rewrite of [Foliate](https://github.com/johnfactotum/foliate)
and bundles, among others: [foliate-js](https://github.com/johnfactotum/foliate-js)
(MIT), [zip.js](https://github.com/gildas-lormeau/zip.js) (BSD-3-Clause),
[fflate](https://github.com/101arrowz/fflate) (MIT),
[PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0),
[libjpeg-turbo](https://libjpeg-turbo.org/) (BSD/IJG — added by this fork),
[Next.js](https://github.com/vercel/next.js) (MIT),
[React](https://github.com/facebook/react) (MIT) and
[Tauri](https://github.com/tauri-apps/tauri) (MIT/Apache-2.0).

---

<div align="center" style="color: gray;">A fork of <a href="https://github.com/readest/readest">Readest</a>. All credit for the reader itself goes to its authors.</div>
