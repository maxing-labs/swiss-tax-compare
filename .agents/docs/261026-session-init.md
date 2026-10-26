# Session：项目初始化与 v1 上线

- 日期：2026-10-26
- 用户要求：参照 priminfo-pro 的功能 / UX / 主题，基于 ESTV 官方税务计算器做一个所得税比价站，新建本地 git 仓库，发布到 swiss-tax-compare.vercel.app；中途改为「先做初始版本，后续计划写进 md，并给一个新 thread 的 prompt」

## 目标

1. 摸清 swisstaxcalculator.estv.admin.ch 的后端接口并写成可缓存的 GET 代理
2. 做出能上线的 v1：输入表单、税额概览、全瑞士地点比较、税务指南
3. 文档、测试、部署，后续计划写进 `roadmap.md`

## 完成内容

| # | 提交 | 内容 |
|---|---|---|
| 1 | `01d60a8` | 后端 `api/index.py`：`/api/meta`、`/api/locations`、`/api/calculate`、`/api/compare`、`/api/curve`、`/api/history`；`server.py` 本地包装；`tests/test_api.py` 21 个离线测试 + `tests/make_fixtures.py` + 5 个上游快照 |
| 2 | `e536e05` | 前端：`index.html`、`style.css`（从 priminfo-pro 派生，去掉 50 个医保专用规则，加表单 / 概览 / 比较样式）、`js/`（main → controller → views 三层，`calc.js` 纯函数 7 个测试）、`i18n/en.js` |
| 3 | `a79080a` | `AGENTS.md`、`README.md`、`.agents/docs/roadmap.md` |

### 部署

- 生产：HEAD `a79080a`，`vercel deploy --prod --yes` 自动建项目 `swiss-tax-compare`（team 同 priminfo），`dpl_FKHbj9fSMTdmsDeuE2RwbYzuPXu4`，别名 https://swiss-tax-compare.vercel.app
- 验证：首页 200 + 标题；`/api/meta`、`/api/calculate`（Zürich 12 万毛薪 → 16'346，边际 25.9%）、`/api/compare`（2110 行，gzip 后 43 KB，2 秒）均 200；`status=9` → 400；`js/main.js` 以 `application/javascript` 返回；重复请求 `x-vercel-cache: HIT`；桌面 + 手机五张截图无 console 错误

### 验证

- `python3 -m unittest`：21 通过；`node --test 'tests/js/*.test.mjs'`：7 通过
- 浏览器（Paseo 标签页 + playwright-core headless）：三个页签渲染正常；已婚切换出现 Person 2；taxable 模式隐藏扣除明细、比较页只剩 26 州府并显示提示

## 关键决策及原因

- **走 ESTV 的 JSON 接口而不是抓 HTML**：官方站是 React SPA，`/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/<op>` 返回干净 JSON；但没有 CORS，所以仍需 Python 后端代理（与 priminfo-pro 架构一致）
- **默认用毛收入（Detailed 接口）**：多数人知道毛薪、不知道应税所得；上游自动扣社保和标准扣除，还返回边际税率和扣除明细。应税所得作为第二口径保留（Simple 接口）
- **比较页用 `API_calculateManySimpleTaxes` 按州批量**：26 个州并行 0.8 秒拿到全部 2110 个市镇，比 26 个州府有价值得多；应税口径该接口不支持（传应税所得返回 0），所以 taxable 模式只比州府
- **边际税率**：gross 模式用上游 `MarginalTaxRate`（官方数字，按应税所得），taxable 模式用 +1'000 CHF 的差分；About 里已说明
- **孩子用「年龄列表」文本框**而不是人数：上游要每个孩子的年龄，一个字段既精确又省空间
- **v1 砍掉曲线 / 历史 / 保存方案 / de zh**（用户要求先出初始版本）：后端接口和 `calc.js` 的纯函数都已写好并有测试，前端只差视图；详见 `roadmap.md`
- **样式直接派生自 priminfo-pro**：同一作者、同一 MIT 许可，用户明确要求沿用主题；用脚本删掉医保专用规则后追加新规则
- **Vercel 直接发生产**（用户要求发布到该域名）；**没有 push 到 GitHub**（用户只说本地 git，与 priminfo 一致等用户决定）

## 遗留问题与下一步

- 见 `roadmap.md`：P1 = 03 Income Curve、04 History、保存方案、de / zh
- 上游 `MAX_YEAR=2026` 写死，每年更新 + 重新生成 fixtures
- 比较页「Use」设为所在地后没有邮编（上游全州接口不返回）
