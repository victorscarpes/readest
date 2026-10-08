# `fork/` — the entire delta of this fork

This fork of [readest/readest](https://github.com/readest/readest) adds **lossless
support for arithmetically-coded JPEGs** and ships its own **Windows installer +
auto-updater**. It is designed to re-apply itself on top of every upstream
release with no manual work — you are pinged only when something needs a human.

## What's here

| path | purpose |
|---|---|
| `patches/0001-acj-feature.patch` | the arithmetic-JPEG feature as **new files only** (`packages/acj-wasm/`, `apps/readest-app/src/services/acj/`, its tests + fixtures). New-file patches apply on any base — they never conflict. |
| `apply-overrides.mjs` | the **only** thing that edits an upstream-owned file: reader hook in `FoliateViewer.tsx`, identity + updater config in `tauri.conf.json`, URLs in `constants.ts`, `DBUS_ID` in `.env.tauri`. Each edit is anchored and idempotent; a missing anchor exits non-zero. |
| `config.json` | fork identity + the Tauri updater **public** key + the updater endpoint. Data for `apply-overrides.mjs`. |

The bot also deletes every `.github/workflows/*` except
`fork-sync-release.yml` (upstream's ~13 workflows need R2 / Apple / Android /
Discord secrets and would only fail noisily here).

## How a release happens

`.github/workflows/fork-sync-release.yml` runs daily (and on demand):

1. Compare upstream's latest release tag to the fork's. Nothing new → stop.
2. `git checkout -B sync/<tag> <upstream tag>`, re-lay this `fork/` overlay.
3. `git apply fork/patches/*.patch` → **conflict ⇒ issue + stop.**
4. `pnpm install`; `setup-vendors`; `node fork/apply-overrides.mjs` → **anchor
   moved ⇒ issue + stop.**
5. `pnpm lint` + arithmetic-JPEG vitest → **fail ⇒ issue + stop.**
6. `tauri-action` builds the NSIS installer, signs it with the fork key, and
   generates `latest.json`; all uploaded to a fork GitHub Release tagged the same
   as upstream.
7. Fork `main` is force-pushed to the built state (linear history:
   `<upstream tag>` → `fork: overlay` → `fork: feature` → `fork: overrides`).

The installed desktop app checks
`https://github.com/victorscarpes/readest/releases/latest/download/latest.json`
(baked into `tauri.conf.json` by `apply-overrides.mjs`) and only accepts updates
signed by the key in `config.json`.

## Fixing a failed sync

The failure issue names the step. Usually an anchor in `apply-overrides.mjs`
drifted because upstream refactored that spot — fix it on the **`fork-base`**
commit (below), then re-run the workflow. To rebuild a specific upstream tag: run
the workflow with `upstream_ref` set.

## Editing the fork / cutting a fork-only revision

The bot rebuilds `main` from **`fork-base`** each release — that commit carries
`fork/`, `.github/workflows/fork-sync-release.yml` and the top-level `README.md`.
The 3 commits above it are regenerated every run, so edits there don't stick.

To change the fork and publish it against the **same** upstream base:

1. Edit `fork/…` (if you touched the feature code, regenerate
   `fork/patches/0001-acj-feature.patch` = `git diff <tag>..HEAD -- <new-file paths>`).
2. Rebuild `main` = `<upstream tag> ─ fork-base ─ (empty) ─ patch ─ overrides`,
   `git tag -f fork-base`, `git push -f origin fork-base main`.
3. `gh workflow run "Fork sync + release" -R victorscarpes/readest -f upstream_ref=v0.12.8 -f release_tag=v0.12.8`

It **reuses the tag** `v0.12.8`: the release is deleted and recreated, its assets
replaced in place, the app version stays equal to the upstream base. One release
per upstream tag, always the newest fork build.

**Caveat:** a same-version fork rev does **not** trip the in-app auto-updater
(Tauri only updates on a strictly-higher semver) — download the fresh
`*-setup.exe` and reinstall. Auto-update stays automatic for real upstream
releases, which bump the version.

## The signing key

The Tauri updater private key + password are the **only** things that can't be
regenerated — lose them and every installed app can never auto-update again.

- CI: Actions secrets `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (write-only, can't be read back).
- Local copy: `C:\Users\vcarpes\readest-fork-signing-key\` (`updater.key` +
  `password.txt`), outside this repo. **Keep a copy in a password manager.**
- Public half: `config.json` → `updater.pubkey`.
- Rotate: `tauri signer generate -w <path> -f`, update `config.json` + both
  secrets, rebuild `fork-base`, cut a release; old-key installs need one manual
  reinstall.

## Notes

- The Windows installer is **unsigned** (no Authenticode cert) — SmartScreen
  warns on first install. Auto-update is unaffected (it uses Tauri's own ed25519
  signature). Add a cert later via two more secrets if desired.
- Distinct identity (`com.victorscarpes.readest`, "Readest (victorscarpes)") — it
  installs alongside official Readest with its own library/settings.
- AGPL-3.0; fork source is public — compliant.
