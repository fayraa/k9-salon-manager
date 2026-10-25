# Changelog

## 1.4.1

**Fixed**
- Settings could be scrolled far past its last section into empty space. Every page now stops scrolling at its last item, on the computer and on phones.

## 1.4.0

**New**
- **Phone version**: K-9 Salon on iPhone and Android, from the phone's home screen. It uses the same sheet through the same bridge, so phones and computers always show the same records. No app store and no install file.
- **Connect a phone by scanning a code**: in the Windows app, **Settings → Use on a phone** shows a code that opens the phone version, and a connection code to scan from inside it. The phone shows the sheet's name and asks before connecting. The connection code hides itself after 3 minutes or when you leave Settings.
- Laid out for a phone: dogs and records as cards, the main sections along the bottom, forms and dog profiles full screen. The phone's Back button closes what's open.
- **Take a photo** of a document straight from Add a document. Several pages become one PDF, as on the computer.
- **PDFs on the phone**: the health record, monthly summary and due list are made on the phone, then shared (email, WhatsApp, Files, print) or saved.
- Bluetooth chip scanners that type like a keyboard work on the phone.

**Also**
- The sections menu in a narrow window can't be reached with Tab while it's closed, and keeps the focus inside while it's open.
- Reconnecting to another sheet while a reload was still on its way no longer shows the old sheet's records.

The bridge script doesn't change. To publish the phone version, turn on GitHub Pages once (see the README).

## 1.3.0

**New**
- **Documents for each dog**: add photos or PDFs of vaccination records, health and death certificates, vet reports, licences, pedigree and purchase papers. Open a dog and use **Add a document**. Files are kept in your Google Drive, in a **K-9 Salon Dog Documents** folder, and listed in a hidden **App Documents** tab.
- **Several photos of one record** (for example each page of a vaccination booklet) are saved together as one PDF, a page each. Photos are shrunk to a readable size, and their location data is removed.
- **Link a document to its record**: pick the vaccination, health check or death certificate it belongs to. The app fills in that record's link column in the sheet (such as Certificate PDF Link), if it's empty. Records with a document show a paperclip in the dog's history.
- **Import papers** for imported dogs: the profile lists the import permit, export health certificate and overseas vaccination record, shows which are on file, and fills in the country from the Source column. Optional check in **Settings → Checks** to flag imported dogs whose papers aren't all on file.
- **Open** a document in your usual PDF or picture viewer, or in Google Drive. **Remove** moves the file to your Drive bin, where it can be restored for 30 days.
- The health record PDF lists the documents on file.

**Needs the bridge update**: documents need version 4 of the bridge script. The app shows how to update it.

## 1.2.0

**New**
- **Quick fill**: fill in one or two details for many dogs at once, typing straight down a list like a spreadsheet. Press Enter to go to the next dog. Ready-made choices for licence number and expiry, kennel, sterilised, status and microchip, or pick any other column. Show only the dogs flagged for that detail, the ones with a blank box, or a whole group. Fill every blank box with one value, then save. Open it from Dogs, from a to-do filter (**Fill these in**) or from the kennel view (**Fill in kennels**).
- **Adopted** is now a dog status, with its own filter on the Dogs page.
- **Your sheet's dropdown lists** are used in the app's forms, so choices like Status, Sterilised, Sex and Kennel No. match the sheet. This needs version 3 of the bridge script; the app shows how to update it.
- Sterilised marked **Exempted** no longer shows as a to-do, and **Pending** shows as coming up.

**Safer saving**
- Quick fill checks each dog's ID, microchip and name before saving. It won't give two dogs the same microchip or licence number, and dogs swapping numbers are saved together.
- Long lists save in groups of 40, so a big fill-in stays well inside Google's time limit. If one group fails, the groups before it stay saved and the app says how far it got.
- If a dog changes in the sheet while the list is open, the app reloads and keeps what you typed for the other dogs. It never moves what you typed onto a different dog.
- Editing a row that has an unticked tick box no longer fails as “changed in the sheet”.

## 1.1.0

**New**
- **Log for many dogs**: record a vaccination, deworming, health check or other treatment for a whole group at once. Pick dogs by breed, kennel, sex or age, fill in the details once, and each dog gets its own row.
- **Record a litter**: saves the litter and adds every puppy to All Breeds with the dam and sire linked. Animal IDs are given automatically, and her mating can be marked successful in the same step.
- **Monthly AVS report**: a summary of births, matings, movements, deaths and treatments for any month. Save it as a PDF and mark the month as submitted.
- **Breeding rules**: enter the limits from your licence conditions (first mating age, litters per 12 months, rest between litters, lifetime litters, C-sections, retirement age). Dams who reach a limit show as not eligible.
- **Health record PDF** for each dog, ready to hand to a buyer.
- **Dog photos**, stored in a Google Drive folder.
- **Kennel view**: every kennel with its capacity and dogs, and a quick way to move a dog.
- **Change history**: every save made in the app is recorded with who made it and what changed.
- **Reminders**: an optional daily email listing what is overdue or due, and a Windows notification when you open the app.
- **Serial chip scanners**: connect a COM-port scanner such as an ESP32 with an FDX-B reader.
- **Automatic updates**: new versions download in the background; restart when you're ready.

**Safer saving**
- Saving many rows is all or nothing: if Google Sheets refuses part of it, nothing is kept.
- Pressing Save again after a slow connection never saves the same thing twice.
- An edit is refused if someone changed that row in the sheet in the meantime.
- Formulas in the sheet are never overwritten, and dropdown rules are checked before saving.

**Easier to use**
- Simpler navigation: Home, Dogs, Breeding, Records, Reports and Settings.
- Bigger text and buttons, a text size setting (Ctrl + / Ctrl −), a high-contrast option, and full keyboard use.

**Needs the bridge update**: bulk logging, litters, photos, reminders, change history and shared settings need version 2 of the bridge script. The app shows how to update it.

## 1.0.0
- First desktop version: dogs, breeding, health, movement and facility records, synced with Google Sheets through the bridge script.
