# Data pipeline

Run from the repository root:

```powershell
python scripts/generate_data.py
npm run validate:data
```

The generator uses pinned snapshots under `scripts/vendor/`, reproduces the three files in `public/data/`, keeps 303 ID-named 100×100 PalCalc PNG icons, and creates SVG fallbacks only for the three hidden internal records missing upstream icons. It fails on unexpected Pal counts, rule counts, partner-skill/active-skill coverage, duplicate IDs, missing references, or any mismatch between PalCalc v1.17.2 and the independent compact 1.0 export.

`breeding.json` intentionally retains all 46,972 PalCalc rules, including rules referencing internal/quest records. The `selectable` field and manifest `usableRules` count identify the player-facing subset; runtime queries must exclude rules whose parent or child is not selectable.
