# Notes: Custom Categories & Deletion — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)

## Problem

In the notes section (the "Objects" list), users have no way to:
1. Organize notes into categories they define themselves.
2. Select multiple notes and delete them in bulk (clearing out junk).
3. Delete a single note from its detail view.

Today notes are auto-tagged by the AI with a fixed `domain` (work, personal, health,
family, finance, project, misc) and `objectType` (task, idea, reminder, …). This grouping
is not user-controllable, and there is no delete affordance anywhere in the UI even though a
soft-delete backend endpoint and `apiService.deleteObject()` already exist but are unused.

## Goals

- Let users create their own named categories and file notes into them (one category per note).
- Keep the AI's automatic tagging working; custom categories are an additive layer the user controls.
- Fill categories via a hybrid of manual assignment and simple keyword rules, where **a manual choice always wins over a rule**.
- Let users multi-select notes and delete them.
- Let users delete an individual note from its detail view.

## Non-Goals

- Replacing or removing the existing `domain` / `objectType` auto-tagging.
- Teaching the ML/parsing pipeline about user categories (rules are plain keyword matching in the API layer, not ML classification).
- Multiple categories per note (labels). Decided: **one category per note** (folder model).
- Re-categorizing the entire note history on every rule change (batch reprocessing).

## Decisions (from brainstorming)

- **Category model:** Custom user-defined categories as a *new layer* on top of the existing `domain` field. The AI still auto-tags `domain`; the user can additionally file a note into one of their own categories.
- **Assignment:** Hybrid — manual assignment plus optional per-category keyword rules.
- **Membership:** One category per note. If a keyword rule and a manual choice conflict, the manual choice wins (enforced via a lock flag).
- **Rule application:** Server-side, at note-creation time, plus an explicit "apply to existing notes" action. (Approach A.)

## Data Model

### New table: `user_categories`

| Column        | Type          | Notes                                   |
|---------------|---------------|-----------------------------------------|
| `id`          | uuid (PK)     |                                         |
| `user_id`     | uuid          | FK → users, indexed                     |
| `name`        | text          | display name                            |
| `color`       | text          | hex color for the chip/badge            |
| `icon`        | text, null    | optional Ionicons name                  |
| `keywords`    | text[]        | rule keywords; default `'{}'`           |
| `sort_order`  | int           | display ordering; default 0             |
| `created_at`  | timestamptz   |                                         |
| `updated_at`  | timestamptz   |                                         |

### Changes to `atomic_objects` (new migration)

- `category_id` uuid, nullable, FK → `user_categories(id)` `ON DELETE SET NULL`
- `category_locked` boolean, not null, default `false` — `true` when the user manually assigned the category, which prevents keyword rules from overwriting it.

The existing fixed `category` text[] and `domain` fields are left untouched. Deleting a
category un-files its notes (`category_id` → null) and never deletes the notes themselves.

## Backend

New route `backend/api/src/routes/categories.ts` + `backend/api/src/services/categoryService.ts`:

- `GET    /api/v1/categories` — list the user's categories (ordered by `sort_order`).
- `POST   /api/v1/categories` — create `{ name, color, icon?, keywords? }`.
- `PUT    /api/v1/categories/:id` — update name/color/icon/keywords/sort_order.
- `DELETE /api/v1/categories/:id` — delete (notes' `category_id` set null via FK).
- `POST   /api/v1/categories/:id/apply` — run this category's keywords against the user's
  **unlocked, uncategorized** notes and file matches (`category_id` set, `category_locked` stays false).

### Rule application at note creation

In the existing object-creation path (`objectService`), after a note is persisted:
match `title + content` (case-insensitive substring) against every category's `keywords`
for that user. First match (by `sort_order`) wins. Set `category_id` with
`category_locked = false`. Notes with no keyword match stay uncategorized.

### Note updates and bulk operations

- Extend `PUT /api/v1/objects/:id` to accept `category_id`. Setting it manually sets
  `category_locked = true` (manual override). Passing `null` un-files and clears the lock.
- New `POST /api/v1/objects/bulk` accepting `{ ids: string[], action: 'delete' | 'move', categoryId?: string }`
  so multi-select operations are a single round-trip. `delete` uses the existing soft-delete;
  `move` sets `category_id` + `category_locked = true` on each.

## Mobile UI

### Categories layer

- **`CategoriesScreen.tsx` (new):** list categories with color/icon; add / edit / delete;
  edit the keyword list per category; an "Apply to existing notes" button (calls `:id/apply`).
  Reachable from the Objects screen header.
- **`ObjectsScreen` filtering:** a row of custom-category filter chips alongside the existing
  filters, plus a "group by category" view option. Categories load from `GET /api/v1/categories`.
- **Note detail modal:** a category picker showing the current category and letting the user
  reassign (the manual override → sets `category_locked`).

### Delete features

- **Trash icon in note detail:** add `trash-outline` to the quick-actions row → confirm
  dialog → `apiService.deleteObject()` → close modal + refresh list. Wire `deleteObject`
  through `useObjects` (the API method already exists).
- **Multi-select on the list:** a "Select" toggle in the header enters selection mode;
  tapping cards toggles a checkbox; a bottom action bar shows **Delete** and
  **Move to category…**. Delete confirms, then calls `POST /api/v1/objects/bulk` and refreshes.

## Testing

- **Backend:** category CRUD; rule matching (match / no-match / manual-lock-not-overwritten);
  `:id/apply` only touches unlocked + uncategorized notes; bulk delete and bulk move;
  `ON DELETE SET NULL` behavior when a category is deleted.
- **Mobile:** manual on-device testing per existing workflow (no automated mobile tests).

## Rollout / Phasing

The implementation plan will be phased; each phase is shippable on its own:

1. **Phase 1 — Delete features.** Trash icon in detail + multi-select delete. Small,
   independent, immediately useful. (Bulk endpoint can start as delete-only.)
2. **Phase 2 — Categories + manual assignment.** Data model, category CRUD, manager screen,
   detail-modal picker, filter chips, bulk "move to category".
3. **Phase 3 — Keyword rules.** Per-category keywords, rule application at creation,
   "apply to existing notes".
