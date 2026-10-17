# Changelog

## 1.2.0

**New**
- **Quick fill**: fill in one or two details for many dogs at once, typing straight down a list like a spreadsheet. Press Enter to go to the next dog. Ready-made choices for licence number and expiry, kennel, sterilised, status and microchip, or pick any other column. Show only the dogs flagged for that detail, the ones with a blank box, or a whole group. Fill every blank box with one value, then save. Open it from Dogs, from a to-do filter (**Fill these in**) or from the kennel view (**Fill in kennels**).
- **Adopted** is now a dog status, with its own filter on the Dogs page.
- **Your sheet's dropdown lists** are used in the app's forms, so choices like Status, Sterilised, Sex and Kennel No. match the sheet. This needs version 3 of the bridge script; the app shows how to update it.
- Sterilised marked **Exempted** no longer shows as a to-do, and **Pending** shows as coming up.

**Safer saving**
- Quick fill checks each dog's ID, microchip and name before saving, and never puts the same microchip or licence number on two dogs.
- Long lists save in groups of 40, so a big fill-in stays well inside Google's time limit. If one group fails, the groups before it stay saved and the app says how far it got.
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
