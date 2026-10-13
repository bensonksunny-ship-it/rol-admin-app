# RFF external app sync

ROL Admin's RFF page can show students, programs and fees from the separate
RFF app. ROL Admin only **reads** that data. Nothing in the RFF app changes:
not its ownership, users, data or security rules. Add/Rename/Delete/Edit are
hidden in ROL Admin while connected, because the RFF app stays the place where
that data is edited.

## How it works

1. A user opens `/rff` in ROL Admin.
2. The page calls the `getRFFData` Cloud Function (in ROL Admin's own Firebase).
3. The function checks the user has RFF access in ROL Admin (Founder, or an RFF
   position), reads the RFF app's Firestore using a read key, and sends back the
   students and programs.
4. The page refreshes every minute while open, and on the ↻ button.

The read key stays on the server (as a Cloud Function secret). It is never in
the browser.

## One-time setup

1. **Get a read key from the RFF app's Firebase.** In the Firebase console, open
   the **RFF** project → ⚙️ Project settings → Service accounts → *Generate new
   private key*. This downloads a `.json` file. It doesn't change anything in
   the RFF app.

2. **Store it in ROL Admin** (from this repo, logged in to the ROL project):

   ```bash
   firebase functions:secrets:set RFF_SERVICE_ACCOUNT < path/to/that-file.json
   ```

   Then delete the downloaded file.

3. **Turn it on:** in `.env`, set `VITE_RFF_SOURCE=external`.

4. **Deploy:** `npm run deploy`.

## Matching the RFF app's data

`functions/index.js` assumes the RFF app stores data as:

- `rff_programs`: `name`
- `rff_students`: `name`, `programId`, `ageOrClass`, `guardianName`,
  `guardianPhone`, `admissionDate`, `feeAmount`, `feePaid`, `feePaidDate`

If the RFF app uses different collection or field names, change
`RFF_EXT_PROGRAMS` / `RFF_EXT_STUDENTS` and `rffMapProgram` / `rffMapStudent` in
`functions/index.js`. That's the only place to change; the pages don't need to.
