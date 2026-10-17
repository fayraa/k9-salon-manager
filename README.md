# K-9 Salon Manager

A Windows desktop app for running a licensed dog-breeding kennel's records. Everything is saved in your own
Google Sheet, so the sheet stays the single source of truth and anyone with access to it can still work there.

**Download:** get the latest `K-9-Salon-Manager-Setup-x.y.z.exe` from the
[Releases page](https://github.com/fayraa/k9-salon-manager/releases/latest) and run it.
Windows may say it protected your PC because the installer isn't code-signed: choose **More info → Run anyway**.
It installs for your Windows user only and adds Start menu and desktop shortcuts. After that, the app updates itself.

## What it does
- **Home**: what needs attention (licences, annual checks, vaccinations, parasite treatments, breeding limits,
  sterilisation of retired dogs) and what's coming up (due dates, expected whelpings, heats, training refreshers).
- **Dogs**: search and filter every dog, or see them **by kennel** with capacity. Each dog has a profile with
  photo, microchip, to-do list, breeding history, offspring and every record, plus a **health record PDF**.
- **Log for many dogs**: one vaccination or deworming for a whole group, one row per dog.
- **Quick fill**: type a detail such as licence number, kennel or sterilised straight down a list of dogs, then save
  them all at once.
- **Documents**: photos and PDFs of each dog's records and import papers, kept in Google Drive and linked to the
  record they belong to. Several photos of one record become one PDF.
- **Record a litter**: the litter plus every puppy in one step, parents linked, IDs given automatically.
- **Breeding**: dams, who's expecting, and eligibility under the rules you set from your licence conditions.
- **Reports**: a monthly summary to help with your AVS submission (save as PDF, mark as submitted),
  a due list, change history, and a herd summary.
- **Chip scanners**: keyboard-style USB scanners work anywhere; serial (COM port) scanners connect in Settings.
- **Reminders**: an optional daily email and a Windows notification.
- **Accessible**: large text sizes, high contrast, light and dark colours, and full keyboard use
  (Ctrl+K to find anything, Ctrl + and Ctrl − for text size, Ctrl+R to reload).

## Connecting to your sheet (once)
The app talks to your sheet through a small Google Apps Script "bridge" that runs in your own Google account.
The app's setup screen walks you through it:
1. Paste the link to your Google Sheet.
2. Copy the bridge script (the app fills in your sheet ID) into a new project at script.google.com and save.
3. Run `setupAppBridge` and approve access. The log shows your **access key**.
4. Deploy → New deployment → Web app, *Execute as: Me*, *Who has access: Anyone*. Copy the web app URL.
5. Paste the URL and key into the app.

Keep the URL and key private. Run `resetAppKey` in the script to issue a new key.

### Updating the bridge
When the app says the bridge has an update: copy the new script from **Settings → Connection**, replace the code
in your Apps Script project, run `setupAppBridge` once to approve any new permissions, then
**Deploy → Manage deployments → edit → Version: New version → Deploy**. The URL and key stay the same.

Bridge version 2 adds: saving many rows at once, animal IDs given by the sheet, an **App Change Log** tab,
an **App Photos** tab (hidden) with photos in a **K-9 Salon Dog Photos** Drive folder, shared settings,
and the daily reminder email. Version 3 also sends the sheet's dropdown lists, so the app offers the same choices. Version 4 adds documents:
files in a **K-9 Salon Dog Documents** Drive folder, listed in a hidden **App Documents** tab.

## For developers
See [CLAUDE.md](CLAUDE.md) for the layout, commands and rules. In short:

```
npm ci
npx playwright install --with-deps chromium
npm run check      # build + syntax checks
npm test           # bridge, scanner and UI tests
npm start          # run the app
npm run dist       # Windows app + installer (needs makensis)
```

Releases are built by GitHub Actions when the version in `package.json` changes on `main`. Installed apps check
`releases/latest/download/latest.json`, download the installer, verify its SHA-256 and install it silently
when you choose to restart.

The repository holds no kennel data, sheet IDs, URLs or keys. Test data is made up.
