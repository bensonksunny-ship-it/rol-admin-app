# Director Dashboard — Mobile Card Layouts — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-08-28-director-dashboard-mobile-cards-design.md`

**Goal:** Below `md` (768px), render `MissingCellReportsTable` and
`TenWeekComplianceTable` as stacked card lists instead of cramped tables. Desktop
tables unchanged. Compact `d MMM` dates on cards only.

**Architecture:** One file — `src/components/DirectorDashboard.jsx`. Extract two
shared pieces from duplicated JSX (`cellReportStatusBadge` + `<StatusPill>`,
`<MissingWeeksList>`), then wrap each existing table `hidden md:block` and add a
`md:hidden` card list beside it. `format` / `parseISO` are already imported from
`date-fns`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/DirectorDashboard.jsx` | Modify | status/weeks helpers; responsive split of both tables |

---

## Task 1: Shared helpers

**File:** `src/components/DirectorDashboard.jsx`

- [ ] **Step 1.** Near the other module helpers (`tenWeekBadgeStyle`, ~line 239),
  add:

  ```jsx
  // Row status for the current-week report table — one place for the 5-way branch.
  function cellReportStatusBadge(row, isDismissed) {
    if (row.submitted)      return { label: 'Submitted',     cls: 'text-emerald-700 bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500' }
    if (isDismissed)        return { label: 'Dismissed',     cls: 'text-amber-700 bg-amber-50 border-amber-100',       dot: 'bg-amber-400' }
    if (row.isDue)          return { label: 'Due',           cls: 'text-red-600 bg-red-50 border-red-100',             dot: 'bg-red-500' }
    if (row.isMeetingToday) return { label: 'Meeting Today', cls: 'text-blue-700 bg-blue-50 border-blue-100',          dot: 'bg-blue-500' }
    return { label: 'Upcoming', cls: 'text-slate-500 bg-slate-50 border-slate-100', dot: 'bg-slate-300' }
  }

  function StatusPill({ row, isDismissed }) {
    const s = cellReportStatusBadge(row, isDismissed)
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-full whitespace-nowrap ${s.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${s.dot}`} /> {s.label}
      </span>
    )
  }

  // "d MMM" (e.g. 26 Aug); mobile cards only. Empty ISO → em dash.
  function compactDate(iso) {
    return iso ? format(parseISO(iso), 'd MMM') : '—'
  }

  function MissingWeeksList({ weeks }) {
    return (
      <ul className="divide-y divide-slate-50">
        {weeks.map((w) => (
          <li key={w.weekStart} className="px-3 py-2 text-xs text-slate-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
            Week of {format(parseISO(w.weekStart), 'd MMM yyyy')}
          </li>
        ))}
      </ul>
    )
  }
  ```

- [ ] **Step 2.** In `MissingCellReportsTable`, replace the status `<td>`'s inline
  5-way ternary (lines ~168–188) with `<td className="px-4 py-3"><StatusPill row={row} isDismissed={isDismissed} /></td>`.

- [ ] **Step 3.** In `TenWeekComplianceTable`'s desktop dropdown, replace the inline
  `<ul>…</ul>` (lines ~308–315) with `<MissingWeeksList weeks={missingWeeks} />`.
  Keep the `<p>` header and the `fixed`/`absolute` wrappers.

## Task 2: `MissingCellReportsTable` responsive split

**File:** `src/components/DirectorDashboard.jsx`

- [ ] **Step 4.** Change the wrapper `<div className="overflow-x-auto">` (~line 148)
  to `<div className="hidden md:block overflow-x-auto">`.

- [ ] **Step 5.** Immediately after that closing `</div>` (before the block's
  closing `)}`), add the mobile card list:

  ```jsx
  <div className="md:hidden divide-y divide-slate-100">
    {rows.map((row) => {
      const isDismissed = row.isDue && dismissedIds.has(row.cellId)
      return (
        <div key={row.cellId} className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-slate-800 text-sm">{row.cellName}</p>
            <StatusPill row={row} isDismissed={isDismissed} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {row.leaderName || '—'} &middot; Due {compactDate(row.expectedDate)}
          </p>
          {(row.isDue || isDismissed) && (
            <div className="flex gap-2 mt-3">
              {row.isDue && !isDismissed && (
                <>
                  {remindedIds.has(row.cellId) ? (
                    <span className="text-xs px-2.5 py-1 rounded-lg text-emerald-600 font-semibold">✓ Reminded</span>
                  ) : (
                    <button
                      type="button"
                      disabled={remindingIds.has(row.cellId)}
                      onClick={() => remindLeader(row)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors font-medium disabled:opacity-50"
                    >
                      {remindingIds.has(row.cellId) ? 'Sending…' : 'Remind'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDismiss?.(row.cellId)}
                    className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors font-medium"
                  >
                    Dismiss
                  </button>
                </>
              )}
              {isDismissed && (
                <button
                  type="button"
                  onClick={() => onUndismiss?.(row.cellId)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors font-medium"
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>
      )
    })}
  </div>
  ```

## Task 3: `TenWeekComplianceTable` responsive split

**File:** `src/components/DirectorDashboard.jsx`

- [ ] **Step 6.** Change its wrapper `<div className="overflow-x-auto">` (~line 271)
  to `<div className="hidden md:block overflow-x-auto">`.

- [ ] **Step 7.** After that closing `</div>`, add the mobile card list, reusing the
  component's existing `openCellId` / `setOpenCellId` state:

  ```jsx
  <div className="md:hidden divide-y divide-slate-100">
    {rows.map((row) => {
      const isOpen = openCellId === row.cellId
      const missingWeeks = row.weeks.filter((w) => !w.submitted)
      return (
        <div key={row.cellId} className="px-5 py-4">
          <p className="font-semibold text-slate-800 text-sm">{row.cellName}</p>
          <p className="text-xs text-slate-500 mt-0.5">{row.leaderName || '—'}</p>
          <button
            type="button"
            onClick={() => setOpenCellId(isOpen ? null : row.cellId)}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border mt-2 transition-colors ${tenWeekBadgeStyle(row.missingCount)} ${
              missingWeeks.length > 0 ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current inline-block opacity-70" />
            {tenWeekBadgeLabel(row.missingCount)}
          </button>
          {isOpen && missingWeeks.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden">
              <MissingWeeksList weeks={missingWeeks} />
            </div>
          )}
        </div>
      )
    })}
  </div>
  ```

---

## Verification (manual, browser — `npm run dev`, DevTools ~390px viewport)

Cell page → **summary** tab, as a Cell Director / Founder:

1. Below 768px both sections are card lists; above, the original tables. Never both.
2. Card top line: cell name + status pill; second line `Leader · Due 26 Aug` — no
   wrapped or split dates.
3. Due cell card: **Remind** → `Sending…` → `✓ Reminded`; **Dismiss** → pill flips
   to **Dismissed** + **Undo** appears; **Undo** restores.
4. Pill wording per state matches the desktop table (Submitted / Dismissed / Due /
   Meeting Today / Upcoming).
5. 10-week card: tap badge → missing-week list expands inside the card, pushes
   later cards down; tap again collapses. 0-missing badge not clickable.
6. Desktop 10-week table: floating dropdown still works.
7. `npm run build` succeeds; `npx eslint src/components/DirectorDashboard.jsx` clean.
