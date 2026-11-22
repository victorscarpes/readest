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

`.github/workflows/fork-sync-release.yml` runs daily (and on demand). The fork's
release tags are `<upstream tag>-<revision>` (e.g. `v0.12.20-0`, `v0.12.20-1`,
`v0.12.21-0`): the base always matches the upstream version exactly; the
revision counts fork-only rebuilds of that same upstream version and resets to
`0` whenever upstream cuts a new one. (Releases from before this scheme exist
as a plain `v0.12.20`-style tag with no revision — treated as revision `-1`,
so the next rebuild of that version becomes `-0`.)

1. Compare upstream's latest release tag to the fork's current *base* version
   (the tag with any `-N` stripped).
   - New upstream version → build revision `0` of it.
   - Same upstream version, triggered by a plain manual run (no inputs) →
     build the next revision.
   - Same upstream version, scheduled (cron) run → nothing to do, stop.
2. `git checkout -B sync/<tag> <upstream tag>`, re-lay this `fork/` overlay.
3. `git apply fork/patches/*.patch` → **conflict ⇒ issue + stop.**
4. `pnpm install`; `setup-vendors`; `node fork/apply-overrides.mjs` → **anchor
   moved ⇒ issue + stop.**
5. `pnpm lint` + arithmetic-JPEG vitest → **fail ⇒ issue + stop.**
6. `tauri-action` builds the NSIS installer, signs it with the fork key, and
   generates `latest.json`; all uploaded to a new fork GitHub Release tagged
   `<upstream tag>-<revision>`.
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
3. `gh workflow run "Fork sync + release" -R victorscarpes/readest` — **no inputs.**
   The `check` job sees upstream hasn't moved and a manual (non-cron) run
   happened, so it auto-numbers the next revision of the current upstream
   version (e.g. current release is `v0.12.20-1` → this run publishes
   `v0.12.20-2`). Pass `-f upstream_ref=... -f release_tag=...` only to
   override that (e.g. to rebuild an older tag, or to publish a one-off tag
   like `v0.12.8-test1` to deliberately exercise the in-app updater).

Every fork-only revision is its **own** release — nothing is deleted or
overwritten in place anymore, so old `-N` builds stay in the releases list
(cheap enough that pruning isn't automated; delete old ones by hand with `gh
release delete` if the list gets long).

**Caveat:** going from revision `N` to `N+1` of the *same* upstream version is
a semver **pre-release** step (`0.12.20-1` sorts below plain `0.12.20`, and
below `0.12.20-2`, per semver's pre-release precedence rules). That means:
- `-N` → `-(N+1)` of the same base, and `-N` → a new upstream version's `-0`,
  both compare as a real increase — the in-app updater picks those up
  normally.
- The **one-time** transition from a legacy plain `v0.12.20` tag to its first
  numbered revision `v0.12.20-0` does **not** trip the updater (a pre-release
  sorts below the plain version it's based on) — download the fresh
  `*-setup.exe` once by hand for that specific jump.

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
