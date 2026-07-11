# 帕鲁孵化实验室

面向《幻兽帕鲁》正式版 1.0 的离线优先配种计算器与实用图鉴。

## 功能

- `A + B = ?`、`A + ? = B`、目标全部父母组合
- 单起点最短繁育链
- 基于雄/雌“我的帕鲁”集合的最短多根繁育树
- 简中/英文/图鉴编号搜索与实用图鉴
- PWA 离线使用、移动端布局、GitHub Pages 部署

## 本地数据

“我的帕鲁”按物种和雄/雌保存在当前浏览器的版本化 `localStorage` 中。刷新页面、关闭后重开或安装为 PWA 后都不会丢失；数据版本升级时只会清理已经失效的内部 ID。

本项目没有账号、后端或云同步。清除该站点的浏览器数据、使用另一台设备/浏览器，或更换部署域名时，收藏不会自动迁移。

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
python scripts/generate_data.py
npm run validate:data
```

应用图标由仓库内的 SVG 机械渲染为浏览器兼容的 PNG：`node scripts/render-app-icons.mjs`。

## GitHub Pages

仓库自带 [Pages 工作流](./.github/workflows/pages.yml)。推送到 `main` 后，它会依次执行数据校验、单元测试、构建、Chromium 端到端/离线测试，再以仓库子路径部署静态站点。Vite、PWA 清单和服务工作线程的资源路径都由 `VITE_BASE_PATH` 对齐仓库名。

数据来源、更新方式与权利说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

本项目是非官方同人工具，与 Pocketpair 无关联。

原创代码采用 [SATA License 2.0](./LICENSE)；使用时请为项目点 Star，并感谢作者。游戏名称、数据及相关资产不包含在该授权中。
