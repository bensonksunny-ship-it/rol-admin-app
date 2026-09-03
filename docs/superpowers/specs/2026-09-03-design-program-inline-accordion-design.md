# Design Program Tab — In-Place Card Accordion

## Problem

On the **Program** page (`src/pages/SundayProgram.jsx`), the **Design Program** tab
(`DesignProgramTab`) shows a 2–3 column grid of program cards. Clicking a card sets
`expandedProgram` and renders an element-palette panel **below the entire grid**
(`{expandedProgram && ( … )}`, currently ~lines 1256–1358).

Consequences:

- If the clicked card is near the top of a long grid, the palette appears far down
  the page, frequently off-screen, with no visual connection to the card.
- The user must scroll to find the panel, and scroll back up to see which card is
  selected.

## Goal

Expand the clicked card **in place**: the palette renders directly inside that card,
which breaks out to full width. Only that card expands. The expanded card scrolls
itself into view.

## Scope

- **In scope:** `DesignProgramTab` in `src/pages/SundayProgram.jsx` only.
- **Not touched:** the `DefaultProgramTab` (its timeline rows already expand in
  place), Live Control, `firestore.js`, the `SundayProgramDesign` / `SundayProgramDefault`
  data model.
- **No new timing model.** Design Program is a template, not a dated service, so no
  absolute start/end time is added. Only the existing per-program default duration
  (`durations[name]`, persisted as `SundayProgramDefault.items[].duration`) appears
  as a "time control."

## Design

### 1. Structural move

Remove the below-the-grid block:

- The entire `{expandedProgram && ( <div className="bg-white rounded-2xl …"> … </div> )}`
  element-palette panel (~lines 1256–1358).
- The helpers that exist only to feed it, computed just above the `return`
  (~lines 1035–1038): `selectedAssigned`, `selectedIdx`, `selectedIsCustom`,
  `selectedColor`. (`allPrograms` stays — it is used inside the grid map.)

Render the palette **inside the expanded card** instead. In the
`allPrograms.map((name, idx) => …)` loop, the card wrapper gains a full-width span
and a ref when it is the selected one:

```jsx
<div
  key={name}
  ref={isSelected ? expandedRef : null}
  className={`relative rounded-2xl overflow-hidden transition-all duration-200 ${
    isSelected ? 'col-span-2 sm:col-span-3' : ''
  }`}
  style={{
    background: '#fff',
    boxShadow: isSelected
      ? `0 0 0 2.5px ${color.accent}, 0 6px 20px ${color.accent}28`
      : '0 1px 3px #0000000f, 0 1px 8px #0000000a',
  }}
>
```

The grid container is unchanged (`grid grid-cols-2 sm:grid-cols-3 gap-3`). An
expanded card spans all columns and the following cards reflow beneath it — the
standard accordion-in-a-grid behavior. The single `expandedProgram` string already
guarantees exactly one open card; clicking the open card's body (existing
`onClick={() => setExpandedProgram(isSelected ? null : name)}`) closes it.

### 2. Auto-scroll into view

Near the other `useState`/`useRef` declarations in `DesignProgramTab`:

```jsx
const expandedRef = useRef(null)
```

After the existing effects:

```jsx
useEffect(() => {
  if (expandedProgram && expandedRef.current) {
    expandedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}, [expandedProgram])
```

`useRef` and `useEffect` are already imported at the top of the file.

### 3. Expanded card content — stacked sections

The **collapsed** card body is unchanged: colored top stripe, number badge + name,
element-chip preview (`assigned.slice(0, 4)` + overflow), the always-visible
`⏱ [ ] min default` duration input (kept — see §4), and the footer with the
`assigned.length` count and the `DESIGN ▼` / `CLOSE ▲` pill.

When `isSelected`, an expansion region renders after the clickable body, **inside
the same card wrapper**, `onClick`-stopped so interacting with it doesn't collapse
the card. It has a top border in the card's accent tint and contains, stacked:

1. **Header strip** — small number badge + program name +, when
   `assigned.length > 0`, an `N element(s)` pill + a right-aligned `×` close button
   (`onClick={() => setExpandedProgram(null)}`). Same visual language as the panel
   header being removed.

2. **§ Timing** — a labelled section ("Timing") containing the same duration input
   that is on the collapsed card, bound to the same `durations[name]` state via
   `setProgramDuration(name, …)`. Helper line beneath:
   *"Live Control presets its countdown from this."*

3. **§ Elements** — a labelled section ("Elements") containing the
   `ELEMENT_CATEGORIES.map(…)` category groups and, when
   `customElements.length > 0`, the Custom group — the toggle-chip UI moved
   verbatim from the removed block. It uses the card's own `color`, `assigned`
   (`designs[name] || []`), and `toggleElement(name, el)` instead of the removed
   `selected*` helpers. `disabled={!canEdit}` is preserved on every chip.

### 4. Duration input stays in both places

The collapsed card keeps its inline duration input (a deliberate earlier change —
"a duration can now be changed directly from any closed grid card"). The expanded
**§ Timing** section shows the *same* control bound to the *same* state, so:

- quick duration tweaks still work without expanding, and
- the expanded view still "displays time controls" as required.

No duplication of state — both inputs read/write `durations[name]`.

## Non-Goals

- No absolute start-time / end-time fields on design cards.
- No change to how `DefaultProgramTab` computes per-service cascade times.
- No animation beyond the existing `transition-all duration-200` on the card and
  the smooth `scrollIntoView`.
- No change to "Manage Custom Elements" or "Save Design", which stay below the grid.

## Manual verification

1. Design Program tab, grid with 6+ programs. Click a card in the top row → it
   expands to full width in place; the palette is inside it; the page scrolls so
   the expanded card is visible.
2. Toggle elements → chip state and the collapsed-preview chips update; the footer
   count updates.
3. Change duration in the expanded §Timing → the collapsed card's inline input
   shows the same value; **Save Design** persists it (reload confirms).
4. Click another card → the first collapses, the second expands (only one open).
5. Click the open card's body or its `×` → collapses.
6. Custom program: add one, expand it, assign elements, remove it via its `×`
   while expanded → grid reflows cleanly.
7. Narrow viewport (`grid-cols-2`): expanded card spans both columns; no
   horizontal overflow.
8. Non-editor (`canEdit === false`): chips disabled, duration input hidden as
   before, expansion still opens and scrolls.
