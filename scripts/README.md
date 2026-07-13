# Data pipeline

Run from the repository root:

```powershell
python scripts/generate_data.py
npm run validate:data
```

The generator uses pinned snapshots under `scripts/vendor/`, reproduces the four files in `public/data/`, keeps 303 ID-named 100×100 PalCalc PNG icons, and creates SVG fallbacks only for the three hidden internal records missing upstream icons. It fails on unexpected Pal, rule, active/partner/passive-skill, movement, or refinement counts, missing player-facing references/descriptions, duplicate IDs, or any mismatch between PalCalc v1.17.2, the independent compact 1.0 export, and the locally extracted snapshots.

`skills.json` contains 320 active skills, 288 simplified-Chinese partner-skill records, and 115 standard player-facing passive traits. Active-skill mechanics and localized names come from PalCalc; descriptions and Pal unlock levels come from Save Pal. PalDB supplies the two Cube Turtle description gaps and the simplified-Chinese partner-skill titles/descriptions. The PalDB source-page and checked-in snapshot SHA-256 hashes are recorded in `manifest.json`. Three unused Predator active skills have no upstream description and are the only accepted active-skill description gaps.

The passive catalog is derived from the 1,905 `PassiveSkills` rows in pinned PalCalc `db.json` v1.17.2 / commit `b5e13e90fedc2e95d54fa223da77be464c313001`. Exactly 115 rows are marked as standard passive skills and have complete simplified-Chinese/English names and descriptions; 85 are enabled for random selection. Internal/test and partner-mechanic rows are deliberately excluded from the player-facing catalog. Rank, random availability/weight, surgery data, and localized text remain source facts. A positive `SurgeryCost` identifies the 33 surgery-supported traits; `SurgeryRequiredItem` is kept separately for 35 traits and is not itself treated as proof of surgery support. `guaranteedBy` is a deterministic reverse index of the same snapshot's Pal `GuaranteedPassivesInternalIds` field. The installed Palworld Steam `1.0` build `24088745` and its two 1,905-row passive tables are retained as the current-version extraction anchor; they are not treated as 1,905 displayable player traits.

`breeding.json` intentionally retains all 46,972 PalCalc rules, including rules referencing internal/quest records. The `selectable` field and manifest `usableRules` count identify the player-facing subset; runtime queries must exclude rules whose parent or child is not selectable.

## Movement snapshot

`scripts/vendor/palworld/movement-v1.json` is the normalized movement snapshot for Palworld Steam `1.0` build `24088745`. It was extracted from a legally installed local `Pal-Windows.pak` with CUE4Parse `1.2.2.202607` and `Mapping.usmap` from PalModding/UtililityFiles commit `455de2110d8414f703699204f33cb6ac052a3f98` (blob `4ae676dd2c13a3d74d32df5a89c6f437754ffcd6`, SHA-256 `741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7`). The source export SHA-256 is `528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16`.

To replace the snapshot after producing a compatible raw CUE4Parse export:

```powershell
node scripts/import-movement-snapshot.mjs <path-to-raw-unpack.json>
python scripts/generate_data.py
npm run validate:data
```

The importer requires exactly the 306 PalCalc IDs, cross-checks shared PalCalc fields, and requires movement types for all 288 selectable records. Nine hidden records intentionally have no Blueprint movement type. Speed fields are raw game parameters; negative numbers mean unavailable, movement type is not mountability, and optional fly overrides remain separate because they are not a universal final-flight-speed calculation.

## Refinement snapshot

`scripts/vendor/palworld/refinement-v1.json` contains the normalized 0-star and 4-star endpoints for all 288 selectable Pals in Steam `1.0` build `24088745`. It combines the five-rank partner-skill/passive tables with the Pal game settings, work-suitability base table, and 18 Blueprint/ranch/glider special cases. Rank 1/index 0 is user-facing 0 stars; Rank 5/index 4 is 4 stars. The checked-in snapshot retains numeric values, targets, technical IDs, work levels, source assets, notes, and hashes but not the multi-megabyte raw Unreal exports.

To rebuild it from the compatible local CUE4Parse exports and `refinement-special-v1.json`:

```powershell
node scripts/import-refinement-snapshot.mjs <path-to-local-unpack-directory>
python scripts/generate_data.py
npm run validate:data
```

The importer requires 682 partner-skill rows, 1,905 rows in each passive table, 753 common Pal rows, and exactly 18 special records. It asserts the 1.0 rank endpoints, `+5%` per-star stat coefficient, 270 ranked-table records, 258 changed endpoints, all 288 IDs, and representative work/special values. Unlabelled effect values remain raw internal parameters rather than guessed percentages.
