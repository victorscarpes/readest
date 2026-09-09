#!/usr/bin/env node
/*
 * fork/apply-overrides.mjs — the ONLY thing that edits an upstream-owned file.
 *
 * Run from the repo root after `git apply fork/patches/*.patch`:
 *
 *     node fork/apply-overrides.mjs
 *
 * It rewrites a handful of spots across six files, each edit guarded by an
 * anchor. If an anchor is missing (upstream refactored that spot) the script
 * exits non-zero with a clear message — `fork-sync-release.yml` turns that into a
 * "Fork sync failed" issue and publishes nothing. Every edit is value-based, so
 * it is idempotent and survives `biome format` re-wrapping the lines it touches.
 *
 *   1. apps/readest-app/src-tauri/tauri.conf.json — productName, bundle id,
 *      updater pubkey + endpoints (installed app checks the fork's releases).
 *   2. apps/readest-app/src/services/constants.ts — download / changelog /
 *      nightly URLs, and the JS-side READEST_UPDATER_PUBKEY.
 *   3. apps/readest-app/src/app/reader/components/FoliateViewer.tsx — the two
 *      lines wiring the arithmetic-JPEG transcoder onto book.transformTarget.
 *   4. apps/readest-app/.env.tauri — DBUS_ID (Linux only; kept consistent).
 *   5. extensions/windows-thumbnail/src/com_provider.rs +
 *      src-tauri/nsis/installer-hooks.nsh — a fork-specific Explorer thumbnail
 *      CLSID (so it installs beside official Readest) + a guarded uninstall.
 *
 * Afterwards it runs `biome format --write` on the edited code/json so the tree
 * stays `pnpm format:check` clean.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const forkDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(forkDir, '..');
const app = join(repoRoot, 'apps', 'readest-app');
const cfg = JSON.parse(readFileSync(join(forkDir, 'config.json'), 'utf8'));
const forkEndpoint = cfg.updater.endpoints[0];
const base = `${cfg.releasesPageUrl}/latest/download`; // .../releases/latest/download

const toFormat = new Set();
let failed = false;

const edit = (relPath, fn) => {
  const p = join(app, relPath);
  const before = readFileSync(p, 'utf8');
  let out;
  try {
    out = fn(before);
  } catch (e) {
    console.error(`FAIL  ${relPath}: ${e.message}`);
    failed = true;
    return;
  }
  if (out === before) {
    console.log(`noop  ${relPath} (already applied)`);
    return;
  }
  writeFileSync(p, out, 'utf8');
  if (/\.(ts|tsx|js|jsx|json)$/.test(relPath)) toFormat.add(p);
  console.log(`edit  ${relPath}`);
};

/**
 * Set the string-literal value captured by `re` group 1 to `target`.
 * `re` must match "<name/key> ... '<value>'" (or "...\"<value>\""). Throws if the
 * name/key itself is gone; returns src unchanged if the value is already target.
 */
const setStr = (src, re, target) => {
  const m = src.match(re);
  if (!m) throw new Error(`anchor not found: ${re}`);
  if (m[1] === target) return src;
  return src.slice(0, m.index) + m[0].replace(m[1], target) + src.slice(m.index + m[0].length);
};

// 1. tauri.conf.json ------------------------------------------------------
edit('src-tauri/tauri.conf.json', (s) => {
  let o = s;
  o = setStr(o, /"productName":\s*"([^"]*)"/, cfg.productName);
  o = setStr(o, /"identifier":\s*"([^"]*)"/, cfg.identifier);
  o = setStr(o, /"pubkey":\s*"([^"]*)"/, cfg.updater.pubkey);
  const re = /"endpoints":\s*\[[\s\S]*?\]/;
  if (!re.test(o)) throw new Error('anchor not found: updater.endpoints');
  const desired = `"endpoints": ["${forkEndpoint}"]`;
  o = o.match(re)[0] === desired ? o : o.replace(re, desired);
  return o;
});

// 2. constants.ts -------------------------------------------------------
edit('src/services/constants.ts', (s) => {
  let o = s;
  o = setStr(o, /DOWNLOAD_READEST_URL\s*=\s*'([^']*)'/, cfg.releasesPageUrl);
  o = setStr(o, /LATEST_DOWNLOAD_BASE_URL\s*=\s*'([^']*)'/, base);
  o = setStr(o, /READEST_NIGHTLY_UPDATER_FILE\s*=\s*'([^']*)'/, forkEndpoint);
  o = setStr(o, /READEST_UPDATER_PUBKEY\s*=\s*'([^']*)'/, cfg.updater.pubkey);
  return o;
});

// 3. FoliateViewer.tsx ------------------------------------------------
edit('src/app/reader/components/FoliateViewer.tsx', (s) => {
  let o = s;

  const importLine = "import { maybeTranscodeArithmeticJpeg } from '@/services/acj';";
  if (!o.includes(importLine)) {
    const anchor = "import { transformContent } from '@/services/transformService';";
    if (!o.includes(anchor)) throw new Error('import anchor (transformService) not found');
    o = o.replace(anchor, `${anchor}\n${importLine}`);
  }

  if (!o.includes('maybeTranscodeArithmeticJpeg(')) {
    const anchor =
      "book.transformTarget?.addEventListener('data', getDocTransformHandler({ width, height }));";
    if (!o.includes(anchor)) throw new Error('listener anchor (getDocTransformHandler) not found');
    const block = [
      anchor,
      '      // Arithmetic-coded JPEGs (SOF9/10) are valid JPEG but no webview',
      '      // decodes them. Losslessly transcode to baseline Huffman here, before',
      '      // foliate turns the bytes into a blob: URL. Runs after',
      '      // getDocTransformHandler, which passes image resources through untouched.',
      "      book.transformTarget?.addEventListener('data', (event: Event) => {",
      '        const { detail } = event as CustomEvent<{ data: unknown; type: string; name?: string }>;',
      "        if (detail.type !== 'image/jpeg') return;",
      '        const original = detail.data;',
      '        detail.data = Promise.resolve(original)',
      '          .then((data) =>',
      '            maybeTranscodeArithmeticJpeg(',
      "              data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'image/jpeg' }),",
      '            ),',
      '          )',
      '          .catch((e) => {',
      "            console.error(new Error(`ACJ transform failed for ${detail.name ?? '?'}`, { cause: e }));",
      '            return original;',
      '          });',
      '      });',
    ].join('\n');
    o = o.replace(anchor, block);
  }
  return o;
});

// 4. .env.tauri -------------------------------------------------------
edit('.env.tauri', (s) => {
  const m = s.match(/^DBUS_ID=(.*)$/m);
  if (!m) throw new Error('DBUS_ID not found');
  return m[1] === cfg.dbusId ? s : s.replace(/^DBUS_ID=.*$/m, `DBUS_ID=${cfg.dbusId}`);
});

// 5+6. windows-thumbnail: give the fork its OWN shell-extension CLSID so it can
//      be installed next to official Readest without clobbering its registration,
//      and make the uninstaller only remove the per-extension association if it
//      still points at the fork's CLSID.
const UP_CLSID_BRACE = '{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}';
const UP_CLSID_RUST = '0xA1B2C3D4_E5F6_7890_ABCD_EF1234567890';
const forkClsidBrace = cfg.thumbnailClsid; // {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}
const forkClsidRust =
  '0x' + forkClsidBrace.replace(/[{}-]/g, '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1_$2_$3_$4_$5');

edit('extensions/windows-thumbnail/src/com_provider.rs', (s) => {
  let o = s;
  if (!o.includes(forkClsidRust)) {
    if (!o.includes(UP_CLSID_RUST)) throw new Error('thumbnail CLSID const (from_u128) anchor not found');
    o = o.split(UP_CLSID_RUST).join(forkClsidRust);
  }
  // keep the doc comments honest
  o = o.split(UP_CLSID_BRACE).join(forkClsidBrace);
  return o;
});

edit('src-tauri/nsis/installer-hooks.nsh', (s) => {
  let o = setStr(s, /!define CLSID_READEST_THUMBNAIL "(\{[^"}]+\})"/, forkClsidBrace);

  // Guard each uninstall association-delete so we don't wipe official Readest's
  // `.<ext>\ShellEx\<handler>` value if it happens to be pointing there.
  const del =
    /^([ \t]*)DeleteRegKey HKCR "(\.[A-Za-z0-9]+)\\ShellEx\\\$\{SHELL_THUMBNAIL_HANDLER\}"[ \t]*$/gm;
  const guarded = '${If} $R9 == "${CLSID_READEST_THUMBNAIL}"';
  if (o.includes(guarded)) return o; // already applied
  if (!del.test(o)) throw new Error('installer-hooks uninstall DeleteRegKey anchor not found');
  return o.replace(
    del,
    (_m, ind, ext) =>
      `${ind}ReadRegStr $R9 HKCR "${ext}\\ShellEx\\\${SHELL_THUMBNAIL_HANDLER}" ""\n` +
      `${ind}\${If} $R9 == "\${CLSID_READEST_THUMBNAIL}"\n` +
      `${ind}    DeleteRegKey HKCR "${ext}\\ShellEx\\\${SHELL_THUMBNAIL_HANDLER}"\n` +
      `${ind}\${EndIf}`,
  );
});

// --- keep the tree biome-format clean ---------------------------------
if (toFormat.size && !failed) {
  const biome = join(repoRoot, 'node_modules', '.bin', 'biome');
  if (!existsSync(biome) && !existsSync(`${biome}.CMD`) && !existsSync(`${biome}.cmd`)) {
    console.error('FAIL  biome not found — run `pnpm install` before fork/apply-overrides.mjs');
    process.exit(1);
  }
  try {
    execFileSync(
      `"${biome}" format --write ${[...toFormat].map((f) => `"${f}"`).join(' ')}`,
      { cwd: repoRoot, stdio: 'inherit', shell: true },
    );
  } catch {
    console.error('FAIL  `biome format --write` failed on the overridden files');
    process.exit(1);
  }
}

// --- self-check ------------------------------------------------------
const expect = [
  ['src-tauri/tauri.conf.json', [cfg.productName, cfg.identifier, cfg.updater.pubkey, forkEndpoint]],
  ['src/services/constants.ts', [cfg.releasesPageUrl, base, forkEndpoint, cfg.updater.pubkey]],
  [
    'src/app/reader/components/FoliateViewer.tsx',
    ["from '@/services/acj'", 'maybeTranscodeArithmeticJpeg('],
  ],
  ['.env.tauri', [`DBUS_ID=${cfg.dbusId}`]],
  ['extensions/windows-thumbnail/src/com_provider.rs', [forkClsidRust]],
  ['src-tauri/nsis/installer-hooks.nsh', [forkClsidBrace, '$R9 == "${CLSID_READEST_THUMBNAIL}"']],
];
for (const [rel, needles] of expect) {
  const body = readFileSync(join(app, rel), 'utf8');
  for (const n of needles) {
    if (!body.includes(n)) {
      console.error(`FAIL  self-check: ${rel} is missing ${JSON.stringify(n)}`);
      failed = true;
    }
  }
}
// upstream identifiers that must be gone
const gone = [
  ['src-tauri/tauri.conf.json', /download\.readest\.com|readest\/readest\/releases/, 'upstream release URL'],
  ['src/services/constants.ts', /download\.readest\.com|readest\/readest\/releases/, 'upstream release URL'],
  ['extensions/windows-thumbnail/src/com_provider.rs', /0xA1B2C3D4_E5F6_7890_ABCD_EF1234567890/, "upstream thumbnail CLSID"],
  ['src-tauri/nsis/installer-hooks.nsh', /\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890\}/i, 'upstream thumbnail CLSID'],
];
for (const [rel, re, what] of gone) {
  if (re.test(readFileSync(join(app, rel), 'utf8'))) {
    console.error(`FAIL  self-check: ${rel} still contains the ${what}`);
    failed = true;
  }
}

if (failed) {
  console.error('\napply-overrides: an anchor moved or a check failed. Fix fork/apply-overrides.mjs.');
  process.exit(1);
}
console.log('\napply-overrides: OK');
