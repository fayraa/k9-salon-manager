# K-9 Salon Manager

Electron desktop app (Windows) for a licensed dog-breeding kennel in Singapore. It reads and writes the owner's
Google Sheet through a Google Apps Script web app ("the bridge", `apps-script/K9AppBridge.gs`).

## Layout
- `src/js/*.js` — renderer modules, concatenated in filename order into one IIFE by `scripts/build.js` → `renderer/app.js`.
- `src/app.css`, `src/body.html` — styles and page shell. `renderer/` holds build output plus the bundled fonts.
- `main.js` / `preload.js` — Electron main process (bridge HTTP calls, prefs, PDF, photo cache, serial ports, updater).
- `apps-script/K9AppBridge.gs` — the bridge. Users paste it into Apps Script; the app fills in `__SHEET_ID__` when copying.
- `scripts/` — build, installer (NSIS), release info. `tests/` — bridge tests (mock Apps Script), scanner tests, UI tests (Playwright).

## Commands
- `npm ci` then `npx playwright install --with-deps chromium` (first time).
- `npm run check` — builds and syntax-checks everything.
- `npm test` — unit tests then UI tests. Set `CHROMIUM_PATH` to use a specific Chromium.
- `npm run dist` — Windows app + installer (needs `makensis`; on Ubuntu `sudo apt-get install nsis`).

## Rules
- Never commit real kennel data: no real microchips, dog names, sheet IDs, sheet URLs, web app URLs or access keys.
  Test data lives in `tests/fixture.js` and uses `999…` test microchips. The repo is public.
- `apps-script/K9AppBridge.gs` must keep `const SPREADSHEET_ID = '__SHEET_ID__';` (checked by `npm run check`).
- The bridge writes to real records. Any change to save logic needs a test in `tests/bridge.test.js`.
  New bridge actions must stay backward compatible, because users must redeploy the script to get them.
  When the bridge gains something useful, bump `BRIDGE_VERSION` in the bridge and `BRIDGE_LATEST` in
  `src/js/00-core.js` (the app then suggests the update). Bump `NEED_BRIDGE` only when the app can't work without it.
- Keep UI text plain and short. Keep keyboard access, focus handling and the high-contrast mode working.

## Releases (maintainer only)
Bump `version` in `package.json`, add a `## x.y.z` section to `CHANGELOG.md`, and commit to `main`. The release
workflow sees the new version, builds the installer and publishes `vx.y.z` with `latest.json`, which installed apps
read to update themselves. If the `release` environment has a required reviewer, it waits for their approval.

## Weekly automated check (Claude)
Work on a branch named `weekly-check/YYYY-MM-DD` and open a pull request. Never push to `main`, never change the
version in `package.json`, never create tags or releases, never merge. If nothing needs fixing, don't open a pull
request; just report.
