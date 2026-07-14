# 帕鲁孵化实验室

> 在线使用：[https://klarkxy.github.io/palworld-breeding-pwa/](https://klarkxy.github.io/palworld-breeding-pwa/)

面向《幻兽帕鲁》正式版 1.0 的离线优先配种计算器与实用图鉴。

## 功能

- `A + B = ?` 与目标全部父母组合
- 单起点最短繁育链
- 基于图鉴“已拥有”标记的最短多根繁育树
- 简中/拼音首字母/英文/图鉴编号搜索，以及可排序、可标记已拥有的实用图鉴
- 图鉴移动参数展示，以及按编号、基础数值、工作等级或指定移动参数排序
- 主动技能属性、威力、冷却、学习等级与说明，以及伙伴技能的当前星级结构化参数
- 独立的被动词条大全：中英文搜索、等级与获取方式筛选，并标明随机池权重、固定携带、词条手术和对应道具信息
- 道具图鉴：简中/拼音/英文/内部 ID 搜索，显示分类、重量、基础出售价、制作配方和用途
- 道具材料计算器：按目标数量递归展开完整合成树，合并共享中间材料，并汇总批次余量与基准工作量
- 每只帕鲁的 0 星 / 4 星精炼切换：战斗倍率、工作等级、伙伴技能数值、牧场产出与滑翔参数
- PWA 离线使用、移动端布局、GitHub Pages 部署

## 本地数据

图鉴中的“已拥有”标记、配种与路线输入、图鉴筛选/排序和 0/4 星偏好都由 Pinia 管理，并按功能保存在当前浏览器的版本化 `localStorage` 中。切换站内页面、刷新、关闭后重开或新开同源窗口都不会丢失；同源窗口会实时同步并以最后一次修改为准。旧版雄/雌记录会自动合并为单条物种记录，数据版本升级时只会清理已经失效的内部 ID。

路线方案树不会写入本地存储；页面恢复后会使用当前 1.0 配种规则与最新库存重新计算，避免数据升级后继续展示旧结果。如果浏览器拒绝本地存储访问，应用仍可在当前页面使用，并会明确提示本次更改无法保存。

状态按职责拆分：`palDataStore` 和 `itemDataStore` 只保存本次运行加载的图鉴、技能、配种与道具索引，不持久化；`collectionStore`、`breedingStore`、`pathsStore`、`paldexStore` 分别使用 `pal-lab.collection.v1`、`pal-lab.breeding.v1`、`pal-lab.paths.v1`、`pal-lab.paldex.v1`。图鉴数据加载后会重新校验内部 ID、筛选枚举和路线深度；只移除失效项，收藏清理数量会显示在页面上。道具数据使用独立 Store，不与帕鲁数据 schema 耦合。

收藏、计算器和路线界面不要求输入性别；库存规划默认玩家可在游戏内调整性别。原始配种规则中的特殊性别方向仍在算法内部保留，因此不会把两个不同子代错误合并。

本项目没有账号、后端或云同步。清除该站点的浏览器数据、使用另一台设备/浏览器，或更换部署域名时，收藏不会自动迁移。

## 数据来源

当前静态快照对应游戏 `1.0`、数据版本 `palworld-1.0-palcalc-v23-skills2-movement1-refinement1-items1`：306 条内部帕鲁记录（其中 288 条可选）、46,972 条原始配种规则（其中 41,550 条可用于可选帕鲁）、320 条主动技能、288 条简中伙伴技能文本、115 条正式玩家被动词条、306 条移动参数记录、288 条 0/4 星精炼记录，以及 2,466 条内部道具记录（其中 1,891 条可在游戏中使用）和 1,414 条配方。288 条可选帕鲁均有内部移动类型和精炼端点；1,891 条可用道具均有中英名称和图标。精确来源、生成时间、数量和 SHA-256 校验值记录在 [`public/data/manifest.json`](./public/data/manifest.json)。

| 本项目数据 | 直接来源与固定版本 | 使用方式 |
|---|---|---|
| 内部 ID、图鉴编号、亚种、中英名称、配种力、内部顺序、雄性概率、基础数值、工作适应性，以及主动技能和被动词条 | [PalCalc `db.json`](https://github.com/tylercamp/palcalc/blob/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.Model/db.json)，`v1.17.2` / commit [`b5e13e9`](https://github.com/tylercamp/palcalc/commit/b5e13e90fedc2e95d54fa223da77be464c313001)，blob `c9a010f3c4a93957251b6d5d1b9bc1b244256200` | 作为帕鲁身份、配种属性和基础图鉴字段的主来源；提供 320 条主动技能的数值，以及 1,905 条内部被动记录中的名称、说明、等级、随机池标记与权重和词条手术字段。词条页只收录其中标记为标准玩家词条、且简中/英文名称与说明完整的 115 条；固定携带者由同一快照的 `GuaranteedPassivesInternalIds` 反向关联。 |
| 父母、子代和父母性别限制 | [PalCalc `breeding.json`](https://github.com/tylercamp/palcalc/blob/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.Model/breeding.json)，同一固定版本，blob `2dc04d319bc2de89691031a0a4456aaa55882461` | 作为 46,972 条配种规则的唯一真值；通配性别仅在本地展开为 `M+F` 与 `F+M`。 |
| 属性、主动技能学习等级和简中/英文说明、亚种复用伙伴技能时使用的 `tribe` 关联 | [palworld-save-pal `pals.json`](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/pals.json) 及[简中](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/l10n/zh-Hans/active_skills.json)/[英文](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/l10n/en/active_skills.json)主动技能表，commit [`e461889`](https://github.com/oMaN-Rod/palworld-save-pal/commit/e46188978a13e74d84c9a1ce5569497ee0555cae) | 按内部技能 ID 关联学习等级和说明；不按可能重名的中文标题连接。 |
| 可见帕鲁的简中伙伴技能标题与说明；两条重岩龟专属主动技能的简中说明 | [PalDB 伙伴技能](https://paldb.cc/cn/Partner_Skill)与[主动技能](https://paldb.cc/cn/Active_Skills)的 `v1.0.0` 页面静态快照，抓取于 `2026-07-12T02:45:55Z`；原始 HTML SHA-256 分别为 `e92d8749f19e34fdae0c8c2a4e001b65430ebd28fbff5485e2acd10d42ea395d`、`e997d9dccd6cf0f7d4c48a32517e59b56a9f82a532cea055d21a38b49bd768d1` | 解析图标路径中的游戏内部 ID，不按显示名猜测关联；花冠叶泥泥通过 `tribe` 复用叶泥泥文本。伙伴技能说明同时派生 115 个乘骑标记；其中 114 个科技等级与本机 1.0 `DT_TechnologyRecipeUnlock` 逐条一致，唯一没有科技表条目的奥沧鲸明确显示为“无科技条目”。抓取脚本和固定产物均在 `scripts/` 下，运行时不访问 PalDB。 |
| 全部内部记录的伙伴技能日文标题回退 | [PalModding/UtililityFiles `DT_SkillNameText_Common.json`](https://github.com/PalModding/UtililityFiles/blob/455de2110d8414f703699204f33cb6ac052a3f98/Json%27s/DataTable/Text/DT_SkillNameText_Common.json)，commit [`455de21`](https://github.com/PalModding/UtililityFiles/commit/455de2110d8414f703699204f33cb6ac052a3f98)，blob `25a3f5510c4a1b0304d1e31bb172bae21ae2bcb7` | 为 306 条记录保留标题回退；正常图鉴中的 288 条可选记录优先显示上述简中文本。 |
| 慢走、行走、奔跑、乘骑冲刺、搬运、游泳与游泳冲刺参数，内部移动类型及 Blueprint 飞行覆盖值 | 维护者本机合法安装的《幻兽帕鲁》Steam `1.0` build `24088745`，从 `Pal-Windows.pak` 的 `DT_PalMonsterParameter` 及角色 Blueprint 解包；使用 [CUE4Parse](https://github.com/FabianFG/CUE4Parse) `1.2.2.202607` 和 [PalModding/UtililityFiles](https://github.com/PalModding/UtililityFiles/commit/455de2110d8414f703699204f33cb6ac052a3f98) 同一固定 commit 的 `Mapping.usmap`（blob `4ae676dd2c13a3d74d32df5a89c6f437754ffcd6`，SHA-256 `741798898aabf3da8803e26ff005a35052b33bd0c90d771aabbb5f2c367f7df7`） | 原始导出物 SHA-256 为 `528b804632f0030186804cd9b1b3a3a89b75f046baa0c77e713d2e3e76009d16`；仓库只提交按当前 306 个内部 ID 归一化的 [`movement-v1.json`](./scripts/vendor/palworld/movement-v1.json)，生成时再写入图鉴数据。 |
| 0 星/4 星伙伴技能、精炼倍率、工作适应性、牧场产出和滑翔参数 | 同一本机 Steam `1.0` build `24088745` 的 `BP_PalGameSetting`、`DT_PartnerSkillParameter`、`DT_PassiveSkill_Main(_Common)`、`DT_PalMonsterParameter_Common`、角色 Blueprint、`DT_ItemLotteryDataTable` 与 `BP_GliderComponent`；解包工具和 Mapping 版本同上 | 本机安装确认当前版本及两张被动表各有 1,905 个内部行；这些行包含大量伙伴技能参数、测试或内部记录，不能直接当作玩家词条。0 星对应内部 Rank 1 / 数组 index 0，4 星对应 Rank 5 / index 4。270 条直接由五阶伙伴技能表生成，18 条牧场、滑翔或固定 Blueprint 机制单独解析；归一化产物为 [`refinement-v1.json`](./scripts/vendor/palworld/refinement-v1.json)。所有原始产物 SHA-256 均写入 manifest。 |
| 道具名称、说明、分类、重量、图标、配方、科技解锁、商店记录与基础出售价 | 同一本机 Steam `1.0` build `24088745` 的 `DT_ItemDataTable(_Common)`、`DA_StaticItemDataAsset`、`DT_ItemRecipeDataTable(_Common)`、`DT_TechnologyRecipeUnlock(_Common)`、`DT_ItemShopCreateData(_Common)`、本地化文本和图标资源；解包工具和 Mapping 版本同上 | 归一化产物为 [`items-v1.json`](./scripts/vendor/palworld/items-v1.json)，运行时拆分为 [`items.json`](./public/data/items.json) 与 [`recipes.json`](./public/data/recipes.json)。计算器按配方批次向上取整并递归展开材料；基准工作量为原始 `WorkAmount / 100`。基础出售价按当前设置 `SellItemRate = 0.1` 计算为 `floor(Price / 10)`，不含伙伴技能等额外修正。 |
| 配种数据独立校验 | [pal-breeding-calculator `palworld-1.0.json`](https://github.com/ZiSangMuZhi/pal-breeding-calculator/blob/e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c/src/data/palworld-1.0.json)，release `v1.0.0` / commit [`e0fca5b`](https://github.com/ZiSangMuZhi/pal-breeding-calculator/commit/e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c)，blob `e629e284587c3e4f38d5efc834479c75307a5548` | 逐条核对 306 个身份和 46,972 条规则；不作为运行时数据源。 |
| 帕鲁头像 | [PalCalc `PalCalc.UI/Resources/Pals`](https://github.com/tylercamp/palcalc/tree/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.UI/Resources/Pals)，同一固定版本 | 303 张 100×100 PNG 按内部 ID 重命名；缺图的 3 条隐藏内部记录（`BlackFurDragon`、`POLICE_HawkBird`、`POLICE_ThunderDog`）由本项目生成 SVG 占位图，不会出现在图鉴选择器中。 |
| 拼音首字母 | 帕鲁简中名称 + [`pinyin-pro` 3.28.1](https://www.npmjs.com/package/pinyin-pro/v/3.28.1) | 仅在浏览器中生成搜索索引，不修改静态帕鲁数据。 |

六个发布数据文件由固定快照生成或校验：[`breeding.json`](./public/data/breeding.json) 保存帕鲁记录和全部规则，[`paldex.json`](./public/data/paldex.json) 保存同一份帕鲁记录，[`skills.json`](./public/data/skills.json) 保存技能与标准被动词条事实，[`items.json`](./public/data/items.json) 保存道具事实，[`recipes.json`](./public/data/recipes.json) 保存完整配方关系，[`manifest.json`](./public/data/manifest.json) 保存来源、数量与校验值。属性/工作类别的简中标签、`selectable` 标记、规则性别展开、固定携带者反向索引和占位图属于本项目的确定性派生结果；图鉴中的“已拥有”标记则完全来自用户在当前浏览器中的本地输入。

移动速度字段是游戏配置参数，不等同于实测移动速度；负数是“不可用”哨兵，不是有效速度。内部移动类型描述角色移动组件，不代表该帕鲁可以乘骑。仅 6 条记录存在有效 Blueprint 飞行速度覆盖值；该覆盖值与基础速度分开保留，也不能当作所有飞行帕鲁统一的最终飞行速度。

精炼端点中，生命、攻击和防御的倍率为 0 星 `×1.00`、4 星 `×1.20`（每星 `+5%`）；满星依次消耗 `4 / 8 / 12 / 24`、合计 48 只同种帕鲁。伙伴技能表中没有明确单位的值保留为“内部参数”，不会擅自改写成百分比。1.0 的工作适应性已不再是旧版的“只在满星全项 +1”：官方说明每次升星提高一种工作适应性，满星再提高全部原生非零工种并封顶 Lv.10；本站前三星的具体分配按当前 1.0 运行时结果推导为“基础等级降序取前三项，不足三项循环”。这个分配顺序属于基于实测的确定性推导，原始高层规则见 [Palworld v1.0 官方更新说明](https://store.steampowered.com/news/app/1623730/view/686383649529010623)，阿努比斯与腾炎龙端点交叉验证见 [社区运行时记录](https://www.reddit.com/r/Palworld/comments/1utxoe6/psa_understanding_why_your_anubis_is_crafting_so/)。

已知源数据缺口：固定的 palworld-save-pal 快照未给 `LazyCatfish`、`LazyCatfish_Gold`、`GhostAnglerfish`、`GhostAnglerfish_Fire` 提供主动技能集合，本站对这四条显示为空，不猜测补全。三条仅供隐藏 Predator 记录使用的主动技能没有简中说明，不影响 288 条可选帕鲁。精炼数据已经覆盖全部 288 条可选记录；少数技能在 0 星没有额外参数时会显示为 `—`，并非缺失。

这些项目的开源许可仅适用于各自代码，不会重新授权《幻兽帕鲁》的名称、数据或游戏衍生图标；相关权利仍归 Pocketpair。完整许可与权利说明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 本地开发

前端采用 Vue 3、Pinia、Naive UI 与 Vite。Naive UI 组件按需导入，视觉仍使用本站的蛋壳卡片、天空蓝和珊瑚色主题；静态图鉴与配种数据由 PWA 缓存，用户输入由 `localStorage` 保存。

```powershell
pnpm install
pnpm run check
pnpm run dev
```

生产预览：

```powershell
pnpm run build
pnpm run preview
```

重新生成并验证已固定版本的数据：

```powershell
node scripts/fetch-palcalc-icons.mjs
node scripts/fetch-paldb-partner-skills.mjs
node scripts/import-refinement-snapshot.mjs <path-to-local-unpack-directory>
python scripts/generate_data.py
pnpm run validate:data
pnpm run validate:items
```

应用图标由仓库内的 SVG 机械渲染为浏览器兼容的 PNG：`node scripts/render-app-icons.mjs`。

## GitHub Pages

仓库自带 [Pages 工作流](./.github/workflows/pages.yml)。推送到 `main` 后，它会依次执行数据校验、单元测试、构建、Chromium 端到端/离线测试，再以仓库子路径部署静态站点。Vite、PWA 清单和服务工作线程的资源路径都由 `VITE_BASE_PATH` 对齐仓库名。

更完整的第三方许可与权利说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

本项目是非官方同人工具，与 Pocketpair 无关联。

原创代码采用 [SATA License 2.0](./LICENSE)；使用时请为项目点 Star，并感谢作者。游戏名称、数据及相关资产不包含在该授权中。
