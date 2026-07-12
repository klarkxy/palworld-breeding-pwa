# Data pipeline

Run from the repository root:

```powershell
python scripts/generate_data.py
npm run validate:data
```

The generator uses pinned snapshots under `scripts/vendor/`, reproduces the four files in `public/data/`, keeps 303 ID-named 100×100 PalCalc PNG icons, and creates SVG fallbacks only for the three hidden internal records missing upstream icons. It fails on unexpected Pal, rule, or skill counts, missing player-facing skill references/descriptions, duplicate IDs, or any mismatch between PalCalc v1.17.2 and the independent compact 1.0 export.

`skills.json` contains 320 active skills and 288 simplified-Chinese partner-skill records. Active-skill mechanics and localized names come from PalCalc; descriptions and Pal unlock levels come from Save Pal. PalDB supplies the two Cube Turtle description gaps and the simplified-Chinese partner-skill titles/descriptions. The PalDB source-page and checked-in snapshot SHA-256 hashes are recorded in `manifest.json`. Three unused Predator active skills have no upstream description and are the only accepted description gaps.

`breeding.json` intentionally retains all 46,972 PalCalc rules, including rules referencing internal/quest records. The `selectable` field and manifest `usableRules` count identify the player-facing subset; runtime queries must exclude rules whose parent or child is not selectable.
