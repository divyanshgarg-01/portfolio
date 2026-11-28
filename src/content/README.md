# Decap-editable content snapshot

These JSON files are the published-content snapshot of the master Next.js portfolio.
Decap CMS edits **these files** through the GitHub backend on `main`; the Vite app reads them through
`src/data/portfolio.ts`. Do not hand-edit generated files unless you are also updating Decap's schema.

Regenerate with:

```bash
node scripts/export-snapshot.cjs
```

The script opens the master SQLite database inside this repository read-only
(`MASTER_DB` and `MASTER_APP` may override the defaults but must resolve inside the repository)
and only exports rows where `deleted_at IS NULL` and `visibility = 'published'`. Social links
must also have `visible === true`. Stale JSON files in the collection folders are removed on
re-run; files in other folders are untouched.

## Singletons

- `settings.json` — the master `settings` singleton, plus `currentlyLines`, `labels`,
  `sectionOrder`, `approach` and `community`. The `labels.preloader` group mirrors
  the loader words and signature. All original keys are preserved.
- `about.json` — the master `about` singleton. `profileImage` is the media path and is
  accompanied by `profileImageAlt`, `profileImageWidth` and `profileImageHeight` (plus
  matching `profileImage*` media metadata used by the static adapter).
- `resume.json` — `{ title, fileUrl, lastUpdated, summary }`.

## Folder collections

Each published entity is a single file named `<id>.json` in its folder:

| Folder | Collection | Extra exported fields |
| --- | --- | --- |
| `projects/` | projects | `coverImage` (path or `""`), `coverAlt`, `coverWidth`, `coverHeight` and `cover*` media metadata |
| `experience/` | experience | original fields only |
| `education/` | education | original fields only |
| `skill-categories/` | skill_categories | original fields only |
| `skills/` | skills | original fields only |
| `achievements/` | achievements | `file` (media path), `fileUrl` (the exact media path), `fileType` (media MIME type) and `file*` media metadata |
| `socials/` | social_links | original fields only; published + visible links only |

All entity files keep `id`, `order`, `visibility`, `featured`, timestamps and other original
fields. `visibility` and `order` are used by `src/data/portfolio.ts` to filter and sort.

## Media handling

JSON files store **paths** (for example `/uploads/profile/divyansh-portrait-reveal.webp`) so
Decap's media widget can resolve them. The Vite adapter converts paths to media IDs
(`media_profile`, `cover_<project-id>`, `achievement_<achievement-id>`) and builds a
`MediaAsset[]` from the exported `*` metadata fields. Achievement `fileUrl` values are the
exact paths from the master media records; no certificate URL rewriting is performed.
