# Swiss Tax Compare

瑞士所得税 / 财富税计算与比价站：把联邦税务管理局（ESTV / FTA）官方计算器 swisstaxcalculator.estv.admin.ch 的后端 JSON 接口代理成简单的 GET 接口，再由前端计算和展示。姊妹项目 `../priminfo-pro`（医保比价）的主题、分层和约定在这里沿用。部署在 Vercel：https://swiss-tax-compare.vercel.app

## 运行

- 本地：`python3 server.py` → http://127.0.0.1:8766
- 后端测试：`python3 -m unittest`（不联网，用 `tests/fixtures/` 里的上游快照）。上游改版或每年更新数据后，用 `python3 -m tests.make_fixtures` 重新生成快照（需联网），再按新数据修正测试
- 前端测试：`node --test 'tests/js/*.test.mjs'`（Node ≥ 22，只用内置 `node:test`），覆盖 `static/js/calc.js` 的纯函数、`state.js` 的 `sameHousehold` 和三份词典的一致性。不要为此加 `package.json`，以免 Vercel 把项目识别成 Node 项目
- 浏览器测试：`tests/e2e/`，覆盖涉及 DOM 和请求的行为：状态徽章、页签懒加载与失效、曲线、历史、保存方案、de / zh 词典残留（用 `page.route` 延迟或改写响应）
  - 先运行 `python3 server.py`，需要联网（经本地服务访问真实上游）
  - 运行：`PLAYWRIGHT_CORE=<playwright-core 目录> CHROMIUM=<浏览器可执行文件> node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`。`server.py` 一次只处理一个请求，多个测试文件并行时页面会加载超时。本机可用 `~/.npm/_npx/*/node_modules/playwright-core` 和 `~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell`
  - playwright-core 不是项目依赖，不要加 `package.json`。找不到 playwright-core 时测试自动跳过；它自带的浏览器版本已安装时可以不设 `CHROMIUM`
  - 服务不在 8766 端口时（或对线上重跑），用 `BASE=http://...` 指定
  - `/api/*` 响应缓存在 `$TMPDIR/swiss-tax-compare-e2e/`（1 小时，键含 `api/index.py` 的哈希）：curve / history / compare 每次各调上游 17–26 次，连续跑几轮后上游会拒绝连接（`Connection refused`）一段时间。要强制重取就删掉这个目录
  - 等待用 `lib.mjs` 的 `settle()`（状态徽章进入 loading 再离开），**不要用** `waitForLoadState("networkidle")`，它在页面曾经 idle 过之后会立即返回
  - 截图检查：`openApp({ phone: true })` 得到 390px 手机视口，再 `page.screenshot()`
- 线上：Vercel，路由见 `vercel.json`（`/api/*` → `api/index.py`，其余 → `static/`）

## 上游接口（已验证，2026-10）

- 基址 `https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/<op>`，全部 POST JSON，返回 `{"response": ...}`，**没有 CORS**，所以必须经后端代理
- `API_searchLocation` `{Search, Language:4, TaxYear}` → 地点列表（`TaxLocationID`、`BfsID`、`ZipCode`、`City`、`Canton`、`CantonID`）；少于 2 个字符返回空
- `API_calculateSimpleTaxes`：输入**应税所得**（`TaxableIncomeCanton/Fed`、`TaxableFortune`），不做任何扣除
- `API_calculateDetailedTaxes`：输入**毛收入**（`RevenueType1/2`、`Revenue1/2`、`Age1/2`、`Fortune`、`Budget: []`），上游自动扣社保（AHV/ALV/NBU/BVG）和标准扣除，并返回 `MarginalTaxRate`、`TaxableIncomeFed/Canton`、`InfoFed/InfoCanton`（扣除明细，四语）
- `API_calculateManySimpleTaxes`：`TaxGroupID` = `CantonID` 时返回该州**全部市镇**（毛收入口径；传应税所得会得到 0）。26 个州并行约 0.8 秒、2110 行
- 枚举：Relationship 1 单身 / 2 已婚 / 3 同居 / 4 注册伴侣；Confession 1 新教 / 2 天主教 / 3 基督公教 / 4 无 / 5 其他；RevenueType 0 无 / 1 受雇毛薪 / 2 自雇净收入 / 3 退休金 / 4 其他；`CantonID` 按州缩写字母序 AG=1 … ZH=26
- 年份范围 2010–2026（`API_getTaxYearRangeCanton`）；请求 2027 会静默回落，所以 `MIN_YEAR` / `MAX_YEAR` 写死在 `api/index.py`，每年更新

## 约定

- **零依赖**：后端只用 Python 标准库，前端是原生 ES 模块、没有构建步骤。引入依赖或构建工具前先征得用户同意。
- **API 逻辑只放在 `api/index.py`**（`handle_api_request`）。`server.py` 只是本地开发的包装层。所有接口都是带查询参数的 GET，参数解析在 `parse_household`，同样的输入要生成同样的 URL（CDN 缓存命中）
- **两种收入口径**：`mode=gross`（默认，走 Detailed）和 `mode=taxable`（走 Simple，边际税率用 +1'000 CHF 的差分算）。比较页在 taxable 模式下只能比 26 个州府（Simple 没有全州批量接口），前端据 `scope: "capitals"` 隐藏范围切换
- **i18n**：用户可见文本放 `static/js/i18n/` 的 `en.js` / `de.js` / `zh.js`，`index.js` 导出 `I18N`。加或改 key 时三份同时改，`tests/js/i18n.test.mjs` 检查三份的 key、类型、函数参数个数和指南卡片一致。德语用瑞士写法（ss，不用 ß），术语跟 ESTV 官方计算器一致；上游扣除明细只有 DE/FR/IT/EN，zh 回落到 en
- **样式**：色板和字体 token 在 `static/style.css` 的 `:root`（与 priminfo-pro 相同的 Editorial Bold 主题）；SVG 图表颜色在 `static/js/views/chart-theme.js`；字体自托管在 `static/fonts/`
- **CDN 缓存**：成功响应带 `s-maxage=3600`（locations / meta 为一天）。错误必须返回非 2xx 且不带缓存头：上游无结果抛 `EmptyResultError` → 502，参数错误抛 `BadRequestError` → 400
- **前端分层**：`main.js`（DOM 事件）→ `controller.js`（取数、状态、调度渲染）→ `views/*.js`（纯渲染）；`calc.js` 是无 DOM 的纯函数，有测试

## 文档

- 统一放在 `.agents/docs/`，文件名格式为 `yymmdd-主题.md`；`roadmap.md` 是后续计划
- **session 开始**：先读 `roadmap.md` 和日期最新的 `yymmdd-session-*.md`
- **session 结束**：新增一份 `yymmdd-session-主题.md`，写清目标、完成内容（附提交 hash）、关键决策及原因、遗留问题与下一步；并更新 `roadmap.md`
