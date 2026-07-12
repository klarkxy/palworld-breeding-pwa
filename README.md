# 帕鲁孵化实验室

> 在线使用：[https://klarkxy.github.io/palworld-breeding-pwa/](https://klarkxy.github.io/palworld-breeding-pwa/)

面向《幻兽帕鲁》正式版 1.0 的离线优先配种计算器与实用图鉴。

## 功能

- `A + B = ?`、`A + ? = B`、目标全部父母组合
- 单起点最短繁育链
- 基于雄/雌“我的帕鲁”集合的最短多根繁育树
- 简中/拼音首字母/英文/图鉴编号搜索与实用图鉴
- 主动技能属性、威力、冷却、学习等级与说明，以及伙伴技能简中说明
- PWA 离线使用、移动端布局、GitHub Pages 部署

## 本地数据

“我的帕鲁”按物种和雄/雌保存在当前浏览器的版本化 `localStorage` 中。刷新页面、关闭后重开或安装为 PWA 后都不会丢失；数据版本升级时只会清理已经失效的内部 ID。

本项目没有账号、后端或云同步。清除该站点的浏览器数据、使用另一台设备/浏览器，或更换部署域名时，收藏不会自动迁移。

## 数据来源

当前静态快照对应游戏 `1.0`、数据版本 `palworld-1.0-palcalc-v23-skills1`：306 条内部帕鲁记录（其中 288 条可选）、46,972 条原始配种规则（其中 41,550 条可用于可选帕鲁）、320 条主动技能、288 条简中伙伴技能文本、303 张游戏图标和 3 张隐藏记录占位图。精确上游版本、生成时间、数量和 SHA-256 校验值记录在 [`public/data/manifest.json`](./public/data/manifest.json)。

| 本项目数据 | 直接来源与固定版本 | 使用方式 |
|---|---|---|
| 内部 ID、图鉴编号、亚种、中英名称、配种力、内部顺序、雄性概率、基础数值、工作适应性，以及主动技能名称、属性、威力、冷却、继承和技能果实标记 | [PalCalc `db.json`](https://github.com/tylercamp/palcalc/blob/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.Model/db.json)，`v1.17.2` / commit [`b5e13e9`](https://github.com/tylercamp/palcalc/commit/b5e13e90fedc2e95d54fa223da77be464c313001)，blob `c9a010f3c4a93957251b6d5d1b9bc1b244256200` | 作为帕鲁身份、配种属性、基础图鉴字段和 320 条主动技能数值的主来源。 |
| 父母、子代和父母性别限制 | [PalCalc `breeding.json`](https://github.com/tylercamp/palcalc/blob/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.Model/breeding.json)，同一固定版本，blob `2dc04d319bc2de89691031a0a4456aaa55882461` | 作为 46,972 条配种规则的唯一真值；通配性别仅在本地展开为 `M+F` 与 `F+M`。 |
| 属性、主动技能学习等级和简中/英文说明、亚种复用伙伴技能时使用的 `tribe` 关联 | [palworld-save-pal `pals.json`](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/pals.json) 及[简中](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/l10n/zh-Hans/active_skills.json)/[英文](https://github.com/oMaN-Rod/palworld-save-pal/blob/e46188978a13e74d84c9a1ce5569497ee0555cae/data/json/l10n/en/active_skills.json)主动技能表，commit [`e461889`](https://github.com/oMaN-Rod/palworld-save-pal/commit/e46188978a13e74d84c9a1ce5569497ee0555cae) | 按内部技能 ID 关联学习等级和说明；不按可能重名的中文标题连接。 |
| 可见帕鲁的简中伙伴技能标题与说明；两条重岩龟专属主动技能的简中说明 | [PalDB 伙伴技能](https://paldb.cc/cn/Partner_Skill)与[主动技能](https://paldb.cc/cn/Active_Skills)的 `v1.0.0` 页面静态快照，抓取于 `2026-07-12T02:45:55Z`；原始 HTML SHA-256 分别为 `e92d8749f19e34fdae0c8c2a4e001b65430ebd28fbff5485e2acd10d42ea395d`、`e997d9dccd6cf0f7d4c48a32517e59b56a9f82a532cea055d21a38b49bd768d1` | 解析图标路径中的游戏内部 ID，不按显示名猜测关联；花冠叶泥泥通过 `tribe` 复用叶泥泥文本。抓取脚本和固定产物均在 `scripts/` 下，运行时不访问 PalDB。 |
| 全部内部记录的伙伴技能日文标题回退 | [PalModding/UtililityFiles `DT_SkillNameText_Common.json`](https://github.com/PalModding/UtililityFiles/blob/455de2110d8414f703699204f33cb6ac052a3f98/Json%27s/DataTable/Text/DT_SkillNameText_Common.json)，commit [`455de21`](https://github.com/PalModding/UtililityFiles/commit/455de2110d8414f703699204f33cb6ac052a3f98)，blob `25a3f5510c4a1b0304d1e31bb172bae21ae2bcb7` | 为 306 条记录保留标题回退；正常图鉴中的 288 条可选记录优先显示上述简中文本。 |
| 配种数据独立校验 | [pal-breeding-calculator `palworld-1.0.json`](https://github.com/ZiSangMuZhi/pal-breeding-calculator/blob/e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c/src/data/palworld-1.0.json)，release `v1.0.0` / commit [`e0fca5b`](https://github.com/ZiSangMuZhi/pal-breeding-calculator/commit/e0fca5b22c2a4905b725c2ed988e6ef7c1914b8c)，blob `e629e284587c3e4f38d5efc834479c75307a5548` | 逐条核对 306 个身份和 46,972 条规则；不作为运行时数据源。 |
| 帕鲁头像 | [PalCalc `PalCalc.UI/Resources/Pals`](https://github.com/tylercamp/palcalc/tree/b5e13e90fedc2e95d54fa223da77be464c313001/PalCalc.UI/Resources/Pals)，同一固定版本 | 303 张 100×100 PNG 按内部 ID 重命名；缺图的 3 条隐藏内部记录（`BlackFurDragon`、`POLICE_HawkBird`、`POLICE_ThunderDog`）由本项目生成 SVG 占位图，不会出现在图鉴选择器中。 |
| 拼音首字母 | 帕鲁简中名称 + [`pinyin-pro` 3.28.1](https://www.npmjs.com/package/pinyin-pro/v/3.28.1) | 仅在浏览器中生成搜索索引，不修改静态帕鲁数据。 |

四个发布数据文件均由 [`scripts/generate_data.py`](./scripts/generate_data.py) 从上述固定快照生成：[`breeding.json`](./public/data/breeding.json) 保存帕鲁记录和全部规则，[`paldex.json`](./public/data/paldex.json) 保存同一份帕鲁记录，[`skills.json`](./public/data/skills.json) 保存主动与伙伴技能事实，[`manifest.json`](./public/data/manifest.json) 保存来源、数量与校验值。属性/工作类别的简中标签、`selectable` 标记、规则性别展开和 3 张占位图属于本项目的确定性派生结果；“我的帕鲁”则完全来自用户在当前浏览器中的本地输入。

已知源数据缺口：固定的 palworld-save-pal 快照未给 `LazyCatfish`、`LazyCatfish_Gold`、`GhostAnglerfish`、`GhostAnglerfish_Fire` 提供主动技能集合，本站对这四条显示为空，不猜测补全。三条仅供隐藏 Predator 记录使用的主动技能没有简中说明，不影响 288 条可选帕鲁；伙伴技能只展示来源文字，不解析 Blueprint/native 中未写入说明的隐藏倍率。

这些项目的开源许可仅适用于各自代码，不会重新授权《幻兽帕鲁》的名称、数据或游戏衍生图标；相关权利仍归 Pocketpair。完整许可与权利说明见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 本地开发

```powershell
npm install
npm run check
npm run dev
```

生产预览：

```powershell
npm run build
npm run preview
```

重新生成并验证已固定版本的数据：

```powershell
node scripts/fetch-palcalc-icons.mjs
node scripts/fetch-paldb-partner-skills.mjs
python scripts/generate_data.py
npm run validate:data
```

应用图标由仓库内的 SVG 机械渲染为浏览器兼容的 PNG：`node scripts/render-app-icons.mjs`。

## GitHub Pages

仓库自带 [Pages 工作流](./.github/workflows/pages.yml)。推送到 `main` 后，它会依次执行数据校验、单元测试、构建、Chromium 端到端/离线测试，再以仓库子路径部署静态站点。Vite、PWA 清单和服务工作线程的资源路径都由 `VITE_BASE_PATH` 对齐仓库名。

更完整的第三方许可与权利说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

本项目是非官方同人工具，与 Pocketpair 无关联。

原创代码采用 [SATA License 2.0](./LICENSE)；使用时请为项目点 Star，并感谢作者。游戏名称、数据及相关资产不包含在该授权中。
