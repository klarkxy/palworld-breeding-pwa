# Data pipeline

Run from the repository root:

```powershell
python scripts/generate_data.py
pnpm run validate:data
pnpm run validate:items
```

The generator uses pinned snapshots under `scripts/vendor/`, reproduces or verifies the six files in `public/data/`, keeps 303 ID-named 100×100 PalCalc PNG icons plus the deduplicated item-icon bundle, and creates SVG fallbacks only for the three hidden internal Pal records missing upstream icons. It fails on unexpected Pal, rule, active/partner/passive-skill, movement, refinement, item, or recipe counts, missing player-facing references/descriptions/icons, duplicate IDs, or any mismatch between the pinned and locally extracted snapshots.

`skills.json` contains 320 active skills, 288 simplified-Chinese partner-skill records, and 115 standard player-facing passive traits. Active-skill mechanics and localized names come from PalCalc; descriptions and Pal unlock levels come from Save Pal. PalDB supplies the two Cube Turtle description gaps and the simplified-Chinese partner-skill titles/descriptions. The PalDB source-page and checked-in snapshot SHA-256 hashes are recorded in `manifest.json`. Three unused Predator active skills have no upstream description and are the only accepted active-skill description gaps.

The passive catalog is derived from the 1,905 `PassiveSkills` rows in pinned PalCalc `db.json` v1.17.2 / commit `b5e13e90fedc2e95d54fa223da77be464c313001`. Exactly 115 rows are marked as standard passive skills and have complete simplified-Chinese/English names and descriptions; 85 are enabled for random selection. Internal/test and partner-mechanic rows are deliberately excluded from the player-facing catalog. Rank, random availability/weight, surgery data, and localized text remain source facts. A positive `SurgeryCost` identifies the 33 surgery-supported traits; `SurgeryRequiredItem` is kept separately for 35 traits and is not itself treated as proof of surgery support. `guaranteedBy` is a deterministic reverse index of the same snapshot's Pal `GuaranteedPassivesInternalIds` field. The installed Palworld Steam `1.0` build `24088745` and its two 1,905-row passive tables are retained as the current-version extraction anchor; they are not treated as 1,905 displayable player traits.

`breeding.json` intentionally retains all 46,972 PalCalc rules, including rules referencing internal/quest records. The `selectable` field and manifest `usableRules` count identify the player-facing subset; runtime queries must exclude rules whose parent or child is not selectable.

## Movement snapshot

`scripts/vendor/palworld/movement-v1.json` is the normalized movement snapshot for Palworld Steam `1.0` build `24088745`. It was extracted from a legally installed local `Pal-Windows.pak` with CUE4Parse `1.2.2.202607` and `Mapping.usmap` from PalModding/UtililityFiles commit `455de2110d8414f703699204f33cb6ac052a3f98` (blob `4ae676dd2c13a3d74d32df5a89c6f437754ffcd6`, SHA-256 `741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7`). The source export SHA-256 is `528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16`.

To replace the snapshot after producing a compatible raw CUE4Parse export:

```powershell
node scripts/import-movement-snapshot.mjs <path-to-raw-unpack.json>
python scripts/generate_data.py
pnpm run validate:data
```

The importer requires exactly the 306 PalCalc IDs, cross-checks shared PalCalc fields, and requires movement types for all 288 selectable records. Nine hidden records intentionally have no Blueprint movement type. Speed fields are raw game parameters; negative numbers mean unavailable, movement type is not mountability, and optional fly overrides remain separate because they are not a universal final-flight-speed calculation.

## Refinement snapshot

`scripts/vendor/palworld/refinement-v1.json` contains the normalized 0-star and 4-star endpoints for all 288 selectable Pals in Steam `1.0` build `24088745`. It combines the five-rank partner-skill/passive tables with the Pal game settings, work-suitability base table, and 18 Blueprint/ranch/glider special cases. Rank 1/index 0 is user-facing 0 stars; Rank 5/index 4 is 4 stars. The checked-in snapshot retains numeric values, targets, technical IDs, work levels, source assets, notes, and hashes but not the multi-megabyte raw Unreal exports.

To rebuild it from the compatible local CUE4Parse exports and `refinement-special-v1.json`:

```powershell
node scripts/import-refinement-snapshot.mjs <path-to-local-unpack-directory>
python scripts/generate_data.py
pnpm run validate:data
```

The importer requires 682 partner-skill rows, 1,905 rows in each passive table, 753 common Pal rows, and exactly 18 special records. It asserts the 1.0 rank endpoints, `+5%` per-star stat coefficient, 270 ranked-table records, 258 changed endpoints, all 288 IDs, and representative work/special values. Unlabelled effect values remain raw internal parameters rather than guessed percentages.

## Item and recipe snapshot

`scripts/import-item-snapshot.mjs` builds the checked-in, normalized item snapshot from local CUE4Parse JSON exports. No item rows are synthesized; the current snapshot comes from Palworld Steam `1.0` build `24088745`.

Export these assets from the legally installed Steam `1.0` build `24088745` and place the JSON files anywhere under one local directory:

- `DT_ItemDataTable`
- `DA_StaticItemDataAsset` for effective runtime name, icon, price, and variant overrides
- `DT_ItemRecipeDataTable` and `DT_ItemRecipeDataTable_Common` when both exist
- `DT_TechnologyRecipeUnlock` and its `_Common` table when present
- `DT_ItemShopCreateData` and its `_Common` table when present
- `DT_ItemNameText` / `DT_ItemDescriptionText` locale tables for player-facing names and descriptions

The importer recursively auto-discovers those asset names and accepts the CUE4Parse `{ "Rows": ... }`, `[{ "Rows": ... }]`, `Exports[].Rows`, and `Properties.Rows` wrappers. Explicit repeatable `--item-table`, `--recipe-table`, `--technology-table`, and `--shop-table` options are available if export filenames differ. Locale files can be given as `--name-table zh=<path>` and `--description-table zh=<path>`; recognized directory labels include `zh-Hans`, `en`, and `ja`.

```powershell
node scripts/import-item-snapshot.mjs <path-to-local-item-unpack> --dry-run
node scripts/import-item-snapshot.mjs <path-to-local-item-unpack>
pnpm run validate:items
```

Item rows consume the source fields `OverrideNameMsgID`, `OverrideDescMsgID`, `OverrideName`, `OverrideDescription`, `IconName`, `TypeA`, `TypeB`, `Rank`, `Rarity`, `Price`, `MaxStackCount`, `Weight`, `SortID`, `bLegalInGame`, `bNotConsumed`, `bEnableHandcraft`, `bInTreasureBox`, and `TechnologyTreeLock` when present. Recipe rows require `Product_Id`, `Product_Count`, `WorkAmount`, and paired `Material1_Id`/`Material1_Count` through `Material5_Id`/`Material5_Count`; `Materials[]`, `WorkableAttribute`, `UnlockItemID`, `CraftExpRate`, `EnergyType`, and `EnergyAmount` are also retained when present. `WorkAmount / 100` is emitted as `baseSeconds` and remains a baseline game-work value, not a player/Pal/station-adjusted completion time.

Technology parsing expects recipe references named `RecipeID`, `RecipeId`, `RecipeName`, `RecipeRowName`, or `UnlockRecipeID`, including their list forms. Shop parsing expects `StaticItemId`, `ItemId`, `ProductItemId`, or `Product_Id`, and retains `OverridePrice`, `Price`, `BuyRate`, `SellRate`, stock, and currency fields. The importer deliberately stops with a schema error including the observed row fields when a non-empty technology or shop table contains none of these recognized references, so an upstream layout change cannot silently erase unlock or price data.

`items.json` contains item facts and attached shop offers. `recipes.json` keeps recipe row IDs separate from product IDs, attaches technology unlocks, indexes every route under `recipesByProduct`, and emits strongly connected item components under `cycles`. Main tables take precedence over duplicate `_Common` row IDs; the override counts and every raw table SHA-256 are recorded. Unreal `FName` references are canonicalized case-insensitively to the table's exact row spelling, while each correction is retained in diagnostics. Missing item/recipe references are preserved instead of being mislabeled as natural resources.

The raw `Price` is always retained as `priceRaw`. A derived `baseSellPrice` is written only when a verified divisor is supplied explicitly; for the verified `1.0` `SellItemRate=0.1`, use `--sell-price-divisor 10`. The integer result is `floor(priceRaw / 10)`, matching the runtime `int32` sale price, and the exact formula is recorded in source metadata. It is the base per-item sale value before partner-skill modifiers. Item icons are likewise optional: pass `--icons-dir <directory>` containing verified `<icon-id>.webp` or `<icon-id>.png` files to copy them into `public/item-icons` and emit the matching path. The item's `IconName` is used before its item ID so shared icons are copied once; WebP wins when both formats exist. The dedicated output directory is reconciled on every import, removing stale PNG/WebP files from older runs. Otherwise the UI must use its fallback.
