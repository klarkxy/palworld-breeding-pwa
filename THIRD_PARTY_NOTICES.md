# Third-party notices

This application is unofficial and is not affiliated with Pocketpair. Palworld names, terminology, gameplay data, icons, and related intellectual property belong to Pocketpair. The repository contains 303 game-derived 100×100 PNG icons pinned from PalCalc v1.17.2. Three non-selectable internal records absent from PalCalc's icon set use generated local SVG placeholders and are never shown in the user-facing Paldex.

The project's original code is licensed under the Star And Thank Author License (SATA), Version 2.0. That license does not relicense any third-party data or game-related rights listed below.

## pinyin-pro

- Repository: <https://github.com/zh-lx/pinyin-pro>
- Version: `3.28.1`
- Use: Chinese-name pinyin-initial generation for local Pal search.
- License: MIT, Copyright 2022-present zh-lx.

## PalCalc

- Repository: <https://github.com/tylercamp/palcalc>
- Snapshot: tag `v1.17.2`, commit `b5e13e90fedc2e95d54fa223da77be464c313001`
- Data blobs: `db.json` `c9a010f3c4a93957251b6d5d1b9bc1b244256200`; `breeding.json` `2dc04d319bc2de89691031a0a4456aaa55882461`
- Use: authoritative Pal identity, breeding, gender probability, localization, and base-stat data.
- Icons: `PalCalc.UI/Resources/Pals` at the same tag, renamed to internal IDs; these game-derived images are excluded from this project's SATA license.
- License: MIT-style license, Copyright 2024 Tyler Camp. The repository license covers its software; it does not transfer Pocketpair's rights in extracted game data.

## Palworld Breeding Calculator

- Repository: <https://github.com/ZiSangMuZhi/pal-breeding-calculator>
- Snapshot: release `v1.0.0`; exact data blob `e629e284587c3e4f38d5efc834479c75307a5548` first present in commit `e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c`
- Use: independent, byte-pinned cross-check of all 306 Pal identities and 46,972 ordered breeding rows. It is not the authoritative breeding source.
- License: MIT, Copyright 2026 ZiSangMuZhi.

## Palworld Save Pal

- Repository: <https://github.com/oMaN-Rod/palworld-save-pal>
- Snapshot: commit `e46188978a13e74d84c9a1ce5569497ee0555cae`
- Use: element types and level-ordered active-skill assignments. PalCalc supplies the displayed localized skill names.
- Data gap: the pinned table has an empty active-skill set for four selectable records (`LazyCatfish`, `LazyCatfish_Gold`, `GhostAnglerfish`, and `GhostAnglerfish_Fire`); the application shows no active skills for those records instead of inventing data.
- License statement: its README states MIT; no standalone license file was present at the pinned snapshot.

## PalModding Utility Files

- Repository: <https://github.com/PalModding/UtililityFiles>
- Snapshot: commit `455de2110d8414f703699204f33cb6ac052a3f98`; `DT_SkillNameText_Common` blob `25a3f5510c4a1b0304d1e31bb172bae21ae2bcb7`
- Use: current partner-skill titles for all 306 records. Six visual/quest variants lack their own table row and are joined through Save Pal's explicit `tribe` field to the corresponding base-Pal row. This source table contains Japanese titles, which are preserved verbatim.
- License: no repository license was identified; the vendored extract is retained only as a transparent, pinned factual source and remains subject to its original rights.
