# Third-party notices

This application is unofficial and is not affiliated with Pocketpair. Palworld names, terminology, gameplay data, icons, and related intellectual property belong to Pocketpair. The repository contains 303 game-derived 100×100 Pal icons pinned from PalCalc v1.17.2 and 929 deduplicated item icons extracted from the installed game. Three non-selectable internal Pal records absent from PalCalc's icon set use generated local SVG placeholders and are never shown in the user-facing Paldex.

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
- Use: authoritative Pal identity, breeding, gender probability, localization, base-stat data, active-skill element/power/cooldown metadata, and the player-facing passive-trait catalog. The pinned database contains 1,905 internal passive rows; the application publishes only the 115 rows explicitly marked as standard passive skills with complete simplified-Chinese/English names and descriptions. Rank, random-pool availability and weight, surgery fields, and guaranteed-carrier links remain derived from this same snapshot.
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
- Use: element types, level-ordered active-skill assignments, and Chinese/English active-skill descriptions. PalCalc supplies the primary localized names and numeric metadata.
- Data gap: the pinned table has an empty active-skill set for four selectable records (`LazyCatfish`, `LazyCatfish_Gold`, `GhostAnglerfish`, and `GhostAnglerfish_Fire`); the application shows no active skills for those records instead of inventing data.
- License statement: its README states MIT; no standalone license file was present at the pinned snapshot.

## PalModding Utility Files

- Repository: <https://github.com/PalModding/UtililityFiles>
- Snapshot: commit `455de2110d8414f703699204f33cb6ac052a3f98`; `DT_SkillNameText_Common` blob `25a3f5510c4a1b0304d1e31bb172bae21ae2bcb7`; `Mapping.usmap` blob `4ae676dd2c13a3d74d32df5a89c6f437754ffcd6`, SHA-256 `741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7`.
- Use: Japanese fallback partner-skill titles for all 306 records, plus Unreal property mappings used while extracting the movement snapshot described below. Six visual/quest variants lack their own text-table row and are joined through Save Pal's explicit `tribe` field to the corresponding base-Pal row. Player-facing records prefer the Chinese PalDB snapshot below.
- License: no repository license was identified; the vendored extract is retained only as a transparent, pinned factual source and remains subject to its original rights.

## Locally extracted Palworld movement snapshot

- Source: a legally installed local Steam copy of Palworld `1.0`, build `24088745`; `Pal-Windows.pak`, `DT_PalMonsterParameter`, and character Blueprints.
- Raw artifact SHA-256: `528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16`.
- Checked-in normalized snapshot: `scripts/vendor/palworld/movement-v1.json`, covering all 306 current internal Pal IDs. All 288 selectable records have an internal movement type; nine hidden records have no matching Blueprint movement type.
- Use: slow-walk, walk, run, ride-sprint, transport, swim, and swim-dash parameters; internal movement type; and six effective Blueprint fly-speed override pairs.
- Semantics: values are game configuration parameters, not measured travel speeds. Negative values are unavailable sentinels. Movement type does not establish mountability, and a Blueprint fly override is not a universal final flight-speed formula.
- Rights: the normalized facts and game-derived terminology remain subject to Pocketpair's applicable rights and are excluded from this project's SATA license.

## Locally extracted Palworld refinement snapshot

- Source: the same legally installed local Steam copy of Palworld `1.0`, build `24088745`; `Pal-Windows.pak`, `BP_PalGameSetting`, partner/passive-skill tables, common Pal parameters, character Blueprints, ranch item lotteries, and glider components.
- Passive-table scope: both extracted passive tables contain 1,905 internal rows. They include partner-skill parameters and other internal mechanics and therefore are not presented as 1,905 player-facing traits; the published 115-trait catalog is selected from the pinned PalCalc database as described above.
- Checked-in normalized snapshot: `scripts/vendor/palworld/refinement-v1.json`, covering the 0-star and 4-star endpoints of all 288 selectable Pal IDs. It contains 270 five-rank table records and 18 Blueprint/ranch/glider/constant special records.
- Raw SHA-256 values: partner table `821d03bf847beb790704be96f6adcf208c2715a18fa038e66fad0294e3e338c9`; passive table `5e5b31e42c08c39dd98a31f2c4f7cf01205e3fa6dced01762154fb0ed3012a34`; common passive table `93df6bcf7f01224230746de98a62553017cf5596424238d80a35c107ff148072`; common Pal table `dd4635e3fca3e8d6e0cafc173fd2fccfe7097a876b34940c77390a36e8244780`; normalized special-case evidence `ca856bba482d8c2988d17dccde30880f49d0e4336e0260f68cd3e908febd3ae5`.
- Semantics: Rank 1/index 0 is 0 stars and Rank 5/index 4 is 4 stars. Numeric fields without a proven unit are retained as internal values. The detailed first-three-star work allocation is a deterministic inference from the official 1.0 rule and current runtime endpoint checks; it is identified as such in the README and UI.
- External interpretation checks: Pocketpair's [official 1.0 changelog](https://store.steampowered.com/news/app/1623730/view/686383649529010623) documents the work-rank overhaul; a [current runtime report](https://www.reddit.com/r/Palworld/comments/1utxoe6/psa_understanding_why_your_anubis_is_crafting_so/) was used to cross-check representative final levels.
- Rights: these normalized facts, game text, item names, and terminology remain subject to Pocketpair's applicable rights and are excluded from this project's SATA license.

## Locally extracted Palworld item and recipe snapshot

- Source: the same legally installed local Steam copy of Palworld `1.0`, build `24088745`; item, recipe, technology-unlock, shop, localized-text, game-setting, and item-icon assets from `Pal-Windows.pak`.
- Checked-in normalized snapshot: `scripts/vendor/palworld/items-v1.json`, containing 2,466 internal item rows, 1,414 recipe rows, source hashes, and reference diagnostics. The user-facing catalog contains the 1,891 rows marked legal in the game.
- Derived values: normalized recipe work is the source `WorkAmount / 100`; base sale value is `floor(Price / 10)` from the extracted `SellItemRate = 0.1`, before partner-skill or other runtime modifiers.
- Icons: 929 shared WebP files are referenced by the normalized rows; shared textures are stored once. These game-derived images are excluded from this project's SATA license.
- Rights: the normalized facts, localized game text, terminology, and item images remain subject to Pocketpair's applicable rights and are excluded from this project's SATA license.

## CUE4Parse

- Repository: <https://github.com/FabianFG/CUE4Parse>
- Extractor package: `CUE4Parse` `1.2.2.202607`, repository commit `ecad882a3049df6f27e0c5c3a3531346305c010b`.
- Use: one-time local parsing of the installed Unreal Engine package and Blueprints. CUE4Parse is not a browser runtime dependency and is not distributed with the application.
- License: Apache License 2.0, Copyright 2026 FabianFG.

## PalDB

- Website: <https://paldb.cc/>
- Snapshot pages: <https://paldb.cc/cn/Partner_Skill> and <https://paldb.cc/cn/Active_Skills>, site version `v1.0.0`, fetched `2026-07-12T02:45:55Z`.
- Source HTML SHA-256: partner skills `e92d8749f19e34fdae0c8c2a4e001b65430ebd28fbff5485e2acd10d42ea395d`; active skills `e997d9dccd6cf0f7d4c48a32517e59b56a9f82a532cea055d21a38b49bd768d1`.
- Use: Chinese partner-skill names and descriptions for all 288 selectable Pal records, plus Chinese descriptions for the two CubeTurtle skills absent from the pinned Save Pal localization table. The snapshot is joined by game internal ID; the application never hotlinks or queries PalDB at runtime.
- Rights: no open-data license was identified. The small factual/game-text snapshot is included for source transparency and remains subject to PalDB's and Pocketpair's applicable rights; it is excluded from this project's SATA license.

================================================================================
Package: Vue
License source: node_modules/vue/LICENSE
================================================================================

The MIT License (MIT)

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

================================================================================
Package: Vue Router
License source: node_modules/vue-router/LICENSE
================================================================================

The MIT License (MIT)

Copyright (c) 2019-present Eduardo San Martin Morote

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

================================================================================
Package: pinyin-pro
License source: node_modules/pinyin-pro/LICENSE
================================================================================

MIT License

Copyright (c) 2022-present zh-lx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

================================================================================
Package: Workbox Build
License source: node_modules/workbox-build/LICENSE
================================================================================

Copyright 2018 Google LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

================================================================================
Package: vite-plugin-pwa
License source: node_modules/vite-plugin-pwa/LICENSE
================================================================================

MIT License

Copyright (c) 2020-PRESENT Anthony Fu <https://github.com/antfu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
