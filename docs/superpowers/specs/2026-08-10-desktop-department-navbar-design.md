# Desktop Two-Row Department Navbar — Design Spec

**Date:** 2026-08-10
**Status:** Approved

## Overview

Add a persistent, two-row horizontal navbar for desktop (`lg:` and up) that replaces the floating grid/modal app switcher (`DepartmentDock` + `DepartmentFolderModal`) as the primary department-navigation surface on desktop. Row 1 lists the user's accessible departments; row 2, shown only while inside a department that has subpages, lists that department's tabs. Mobile is untouched — `DepartmentDock`/`DepartmentFolderModal` keep working exactly as they do today, just explicitly scoped to `lg:hidden`.

No new Firestore collections or backend work. Pure frontend navigation/layout, reusing existing access-filtered data helpers.

## Context

The app currently has **no persistent tab UI at all** — a July 2026 refactor (`2026-07-24-header-dock-refactor-design.md`) deliberately removed the old per-page `DepartmentTabBar` pill row in favor of a single floating button (`DepartmentDock`) that opens a full-screen grid modal (`DepartmentFolderModal`), on every screen size. This spec reintroduces persistent tab chrome, but desktop-only — mobile keeps the dock/modal pattern as-is.

Two data helpers already do exactly the filtering this navbar needs, and are reused rather than re-derived:
- `myDepartmentNames(userProfile, isFounder)` — a user's accessible departments (now living in `src/utils/departmentSubpages.js`, relocated there this session so both the dock and this navbar can share one definition instead of DepartmentDock owning a private copy).
- `getDepartmentSubpages(slug, userProfile)` — a department's permission-filtered tabs, `{ key, label, to, Icon, children? }`.

A comparison prototype (`src/pages/dev/NavPreview.jsx`, route `/dev/nav-preview`) was built earlier in this session to evaluate two interaction patterns live, using the signed-in user's real data. **Option B (two-row persistent tabs) was chosen** over Option A (single row + hover/click mega-menu dropdowns). The prototype route and file are deleted as part of this work — see Rollout.

## Architecture

### New component: `src/components/layout/DesktopDepartmentNav.jsx`

Rendered once, globally, from `MainLayout.jsx` (same call site level as the existing `<DepartmentDock />`). Root element is `hidden lg:block` (inline breakpoint class on the component's own root, matching how `Sidebar.jsx`'s `IconRail`/`MobileHeader` each carry their own breakpoint class rather than being wrapped externally).

Structure:

```
<DesktopDepartmentNav>
  Row 1: sticky top bar, full-bleed background, inner row constrained to max-w-5xl mx-auto
    - "My Workspace" link (Home icon) → /
    - one link per tiles[] (from myDepartmentNames + getDepartmentByName/getDepartmentPath/getDepartmentIcon)
    - horizontal scroll (overflow-x-auto) when the row is wider than the viewport — no "More" menu
  Row 2: only rendered when the active department (by current route) has subpages
    - one tab per getDepartmentSubpages(activeSlug, userProfile)
</DesktopDepartmentNav>
```

Both rows use real `<Link>`/`useNavigate` — unlike the throwaway prototype's demo-only local state, this is real navigation.

### Active-state derivation

- **Active department (row 1):** current `pathname` matched against each tile's `to` (same matching approach `DepartmentDock`'s `activeTile` already uses: exact match or `pathname.startsWith(to + '/')`/`startsWith(to + '?')`).
- **Active subpage (row 2):** `useSearchParams().get('tab')` matched against the active department's subpage `key`s.

### Positioning

`sticky top-0` within the normal document flow inside `MainLayout`'s existing scrollable content column (not `fixed` + manual padding compensation) — row 2's presence/absence changes the navbar's total height depending on route, and `sticky` reserves exactly the space it needs without hand-computed offsets. No changes needed to `MainLayout`'s existing `paddingTop`/`lg:pb-24` values, which exist for the mobile header/dock and are unaffected (both already gated to mobile).

## Row 1 — departments

- Items: `[{ key: 'workspace', label: 'My Workspace', to: '/', Icon: Home }, ...tiles]`, where `tiles` is built the same way `DepartmentDock` builds its tile list today (`myDepartmentNames` → `getDepartmentByName`/`getDepartmentPath`/`getDepartmentIcon` per name).
- Visual: underline-indicator active state (as shown in the approved prototype), not a pill fill — reserving the filled-pill treatment for row 2 so the two rows read as visually distinct tiers.
- Overflow: plain horizontal scroll, no collapsing "More" menu. This was visible and exercised in the approved Option B prototype (Founder's 18-department list), so no separate overflow control is being added.

## Row 2 — subpages

- Only rendered when there's an active department (row 1 match) **and** that department's `getDepartmentSubpages()` result is non-empty.
- Items rendered as filled-pill tabs (matches the approved prototype).
- Clicking a subpage with `children` (only `operations` and `finance` carry these) navigates to that tab's base `to` — same URL `DepartmentDock`'s flat "tap the tile" behavior already produces today. It does **not** expose a third nav row for `children` — see the section below for why that's safe.

## Fixing the Operations children gap

`Finance`'s `children` (Expense/Budget/Payout) already have an in-page switcher — `FinanceTabBar`, rendered directly in `DepartmentHub.jsx` when `activeTab === 'finance'`, writing `financeSub` to the URL. `Operations`'s `children` (Team/Planning/Sub-Department) have **no equivalent** — today they're reachable exclusively through `DepartmentFolderModal`'s nested grid via the `opsSub` query param (confirmed via `DepartmentHub.jsx`'s own comment: "Operations' sub-view used to be an inline toggle strip ... it's now a nested grid inside the [dock modal]").

Since desktop is losing the dock modal as a navigation path, this needs a same-shape fix or desktop users lose the ability to switch Operations' sub-view entirely. Add a small in-page toggle, modeled directly on `FinanceTabBar` (same prop shape: `tabs`, `active`, `onChange`), rendered in `DepartmentHub.jsx` when `activeTab === 'operations'`, writing `opsSub` to the URL exactly like `FinanceTabBar` writes `financeSub`. This is the one piece of substantive (non-navbar) work in this spec — necessary to avoid a functional regression, not a nice-to-have.

## Mobile — unchanged

`DepartmentDock.jsx` and `DepartmentFolderModal.jsx` keep their current behavior and styling completely as-is. The only change is adding `lg:hidden` to `DepartmentDock`'s root `<nav>` so it stops rendering once `DesktopDepartmentNav` takes over at the `lg:` breakpoint.

## Out of scope

- Founder-only links (`/admin/users` User Management, `/people` People Directory) stay exactly where they are today (`IconRail`) — not added to the new navbar.
- No third nav row for `operations`/`finance` children inside the navbar itself (handled page-level, per above).
- No changes to what any user can access — this only relocates *where* the same already-permission-filtered links render.
- Deduplicating `DepartmentDock`'s per-tile access checks any further than the `myDepartmentNames` relocation already done this session.

## Rollout

- Delete `src/pages/dev/NavPreview.jsx` and its route in `App.jsx` (`/dev/nav-preview`) — the throwaway comparison prototype, superseded by this spec.
- New: `src/components/layout/DesktopDepartmentNav.jsx`.
- New: `src/components/OperationsTabBar.jsx` — mirrors `src/components/finance/FinanceTabBar.jsx`'s `{ tabs, active, onChange }` shape exactly. Flat under `src/components/` (not a new `operations/` subfolder) — `finance/` is the exception in this codebase (3 files); everything else this size sits flat, and one new file doesn't justify a new subfolder.
- Edit: `MainLayout.jsx` (render `<DesktopDepartmentNav />`).
- Edit: `DepartmentDock.jsx` (add `lg:hidden` to its root).
- Edit: `DepartmentHub.jsx` (render the new Operations toggle when `activeTab === 'operations'`, read/write `opsSub`).

## Testing

No automated test suite in this project (per `CLAUDE.md`) — verification is manual in the browser: confirm both rows render correctly for a low-access account and a Founder account (18-department scroll case), confirm mobile is pixel-identical to today, confirm Operations' Team/Planning/Sub-Department are reachable on desktop without the dock.
