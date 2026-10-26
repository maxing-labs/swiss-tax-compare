# Session：P1 复核与生产部署

- 日期：2026-10-26
- 用户要求：按初始化记录的 P1 顺序开发收入曲线、历史、保存方案、de / zh；逐项测试、截图、提交，部署后验证并更新 session / roadmap。

## 目标与仓库现状

开始时先读 `AGENTS.md`、`roadmap.md`、`261026-session-init.md`，并补读 P1 和最新的 Tax Savings session。发现用户提供的是旧的启动任务：四项 P1 已实现、提交并上线，后续还新增了 Tax Savings。

本轮按原顺序核对现有功能、运行回归和截图，修正文档并重新部署；没有重复实现，也没有扩大到 roadmap 的下一轮任务。

## 完成内容与提交

| P1 | 已有实现提交 | 本轮核验 |
|---|---|---|
| 03 Income Curve | `e463a19` | 18 个点、有效 / 边际税率、当前收入标记；改收入后更新；应税所得口径隐藏毛收入专用列 |
| 04 History | `af96984` | 2010–2026 共 17 行、倒序、所选年份高亮；缺失年份断线，后续与最后有数据的年份比较 |
| 保存方案 | `aadf4dd` | 对照 priminfo-pro 的 profiles，确认 chips、比较卡片、保存 / 切换 / 刷新保留 / 删除；请求未返回时保存，结果回来自动补数字 |
| de / zh | `481794d` | 三份词典一致、语言按钮、各 P1 页签、方案卡片与 About 翻译；加载前的图表标题和加载后的地点都能切换语言 |

本轮新增提交：`6017cf2`，README 列出已上线的曲线、历史、方案、节税和三语功能，删除将 P1 标成「Planned next」的过期描述。已有四项功能提交和本轮提交均以 `#vibe #claude` 结尾。

## 验证

- `python3 -m unittest`：30 通过。
- `node --test 'tests/js/*.test.mjs'`：15 通过。
- 本地 `tests/e2e/{curve,history,scenarios,lang,tabs}.test.mjs`：13 通过，0 跳过；使用 playwright-core、Chromium headless shell 1223，`--test-concurrency=1`。
- 同样 13 项在 `BASE=https://swiss-tax-compare.vercel.app` 上通过，0 跳过。
- `tabs` 另覆盖首次访问懒加载、跨页签复用、隐藏时改地点后重取、手机图表按容器宽度绘制、晚到的旧请求不会写入状态。
- 首次 Python 测试在沙箱内因本机 socket bind 被禁止而失败；在获准的沙箱外环境运行通过，未修改产品代码或测试来绕过限制。

### 截图

本地和线上分别生成 11 张，包含桌面 1280px、手机 390px 的英文曲线 / 历史、德文曲线、中文历史 / 双方案卡片，另含手机输入区展开的首屏。检查图表、当前行、卡片、语言按钮及排版；页面没有横向溢出，采集期间无 console warning / error 或 pageerror。

- 本地：`/private/tmp/swiss-tax-p1-verification/local/`
- 线上：`/private/tmp/swiss-tax-p1-verification/production/`
- 每个目录的 `report.json` 记录桌面 / 手机的行数、方案数和错误列表。
- 一次性截图脚本：`/private/tmp/swiss-tax-p1-verify.mjs`。截图前等待 toast 消失并停用动画，避免浮层遮挡内容或页签下划线停在过渡位置；这些临时文件未加入仓库。

## 部署与线上核验

- 命令：`vercel deploy --prod --yes`，部署时 HEAD 为 `6017cf2`。
- 部署 ID：`dpl_GYhiM5aYWDwEeNHvc2qQXBn3QWYf`，状态 READY，target production。
- 部署地址：https://swiss-tax-compare-9ydyf0okl-jddymx-8366s-projects.vercel.app
- 生产别名：https://swiss-tax-compare.vercel.app
- 首页 200；曲线 / 历史 / 方案视图、de / zh / index 词典和 controller 共 7 个 JS 文件均 200、`application/javascript`，SHA-256 与本地文件一致。
- `/api/meta`、`/api/calculate`、`/api/curve`、`/api/history` 均 200；Zürich 单身、2026、毛薪 CHF 100'000、无财富 / 教会税时总税为 CHF 11'848，曲线当前点与历史 2026 点与之相同。
- 曲线 18 点、历史 17 点；两接口重复请求均 `x-vercel-cache: HIT`。
- `/api/calculate?status=9` 返回 400，没有 `s-maxage` 缓存指令。
- HTTP 记录：`/private/tmp/swiss-tax-p1-verification/production-http.json`；核验脚本：`/private/tmp/swiss-tax-prod-check.mjs`。

## 关键决策与下一步

- 以当前代码和提交为准识别旧任务，保留已有实现，仅修正已确认过期的说明。
- 应用代码和 API 没有变动，无需引入依赖、重建项目或重复创建四项功能提交。
- P1 四项无剩余工作。原有后续项仍见 `roadmap.md`：手机 sticky header、请求失败时旧数字的提示、未使用代码清理。本轮没有处理这些独立任务。
