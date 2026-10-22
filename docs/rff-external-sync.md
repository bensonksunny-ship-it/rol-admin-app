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

`getRFFData` reads these RFF collections:

- `students`: numeric `id`, `name`, `className`, `age`, `course`, `city`,
  `feeOffered`, `fatherName` / `motherName` / `parentId` (→ `parents`)
- `fees`: one row per payment, linked by numeric `studentId` (= `students.id`).
  Rows with status `PAID` or `PARTIAL` count as money received; `PENDING` rows
  don't. (The RFF app has no `payments` collection; `fees` is the ledger.)
- `expenses`: `title`, `category`, `amount`, `date`. This collection doesn't
  exist in the RFF app yet; the Finance tab stays empty until it does.

It returns `{ totalStudents, studentsList, expensesList, totals, fetchedAt }`.
Each student has `totalFeeOffered`, `totalFeePaid` and `feePending`
(offered − paid; `null` when no fee is offered on record). `totals` holds
`totalFeeOffered`, `totalCollected`, `totalPending` (overpaid students don't
offset others) and `totalExpenses`.

Results are cached in ROL's Firestore (`rff_cache/v2`) for 10 minutes, so
ROL Admin doesn't burn the RFF project's daily read quota.

If the RFF app's collection or field names change, update the `RFF_EXT_*`
constants and the `rffMap*` / `readRFFData` functions in `functions/index.js`.
