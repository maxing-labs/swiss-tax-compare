# Session：P1 —— 收入曲线、历年变化、保存方案、de / zh

- 日期：2026-10-26
- 用户要求：按 roadmap 的 P1 顺序做 03 Income Curve、04 History、保存方案（参照 priminfo-pro 的 profiles）、de / zh 词典并加回语言按钮；每项跑测试、playwright-core 截图、提交；全部完成后发生产并验证；最后写 session 记录、更新 roadmap

## 目标

1. 03 Income Curve 页签（`/api/curve`）
2. 04 History 页签（`/api/history`）
3. 保存方案（chips + 卡片 + localStorage）
4. de / zh 词典 + `中 / EN / DE` 按钮

## 完成内容

| # | 提交 | 内容 |
|---|---|---|
| 0 | `a390f5e` | 修 v1 bug：被新请求取代的旧请求不减 `loadingCount`，连续改两次输入后状态徽章永远停在 "Calculating..."（playwright 复现后修） |
| 1 | `e463a19` | 03 Income Curve：`views/curve.js`（有效税率实线 + 边际税率虚线 + 用户收入竖线，表：收入 / 应税所得 / 总税 / 有效 / 边际 / 税后）；`calc.js` 加 `niceStep`；controller 加 `invalidate()` 和 `LAZY_TABS` |
| 2 | `af96984` | 04 History：`views/history.js`（折线，缺数据的年份断开，选中年份红点；表按年份倒序，含同比 CHF 和 %）；Tax Guide 改为 05；`fmtSignedPct` 负号改为 "−" 与 `fmtSignedChf` 一致 |
| 3 | `aadf4dd` | 保存方案：`views/scenarios.js`、`state.js` 的 `sameHousehold` / `householdSnapshot` / `loadScenarios` / `persistScenarios`、`calc.js` 的 `scenarioSummary`；header 行改为「Scenarios + chips + 保存按钮」，卡片放在 01 页签顶部 |
| 4 | `481794d` | `i18n/de.js`、`i18n/zh.js`，`index.js` 导出三种，header 加回 `中 / EN / DE`；`tests/js/i18n.test.mjs`；州下拉框 aria-label 接上 `lblCantonSelect`；AGENTS.md 更新 i18n 和前端测试说明 |

### 部署

- 生产：HEAD `481794d`，`vercel deploy --prod --yes` → `dpl_6US4mkckGYHA8zVteaPnfYBFsodz`，别名 https://swiss-tax-compare.vercel.app（`vercel inspect` 确认）
- 验证：5 个新 JS 文件 200 + `application/javascript`；`/api/curve`、`/api/history` 200，首次 MISS 约 1.6 秒、再次 `x-vercel-cache: HIT` 约 0.1 秒；下面的浏览器脚本对线上重跑全部通过，无 console 错误

### 验证

- `python3 -m unittest`：21 通过；`node --test 'tests/js/*.test.mjs'`：12 通过（新增 `niceStep`、`sameHousehold`、`scenarioSummary`、词典一致性 2 个）
- 浏览器脚本在 `/tmp/swiss-tax-p1/`（`lib.mjs` 封装 playwright-core + chromium_headless_shell-1223；`idle()` 等状态徽章离开 loading，**不要用** `waitForLoadState("networkidle")`，它在页面曾经 idle 过之后会立即返回）：
  - `badge.mjs`：连续两次改收入后徽章回到 "Data loaded"
  - `curve.mjs`：18 行、用户收入行高亮；在页签内改收入后曲线重取；taxable 口径少一列、副标题切换；桌面 / 手机截图
  - `switch.mjs`：页签隐藏时改地点，切回后数据是新地点的、图按实际宽度（311px）重画
  - `history.mjs` / `history-gap.mjs`：17 行；改年份后高亮跟随；用 `page.route` 把某年改成 null，折线断成 2 段、表里显示 "no data"
  - `scenarios.mjs`：保存 → 改身份再存 → 点卡片切回 → 刷新后仍在 → 计算未返回时保存（先 "Not calculated yet"，结果到达后自动填上）→ 删除
  - `lang.mjs`：de / zh 五个页签逐一检查可见文本和 placeholder / aria-label / title，没有残留的英文词典原文

## 关键决策及原因

- **图表按容器实际像素宽度绘制**（`chartWidth()`，300–820）：固定 820 的 viewBox 在 390px 手机上字号只剩约 5px。页签隐藏时宽度为 0，先按 820 画，`switchTab` 切过去时重画。比较页的柱状图没改（不在本次范围）
- **曲线 x 轴线性**：18 个采样点中 2 万–20 万挤在左侧 40%，但线性轴的斜率才是真实的边际变化；对数轴会误导
- **历史图 y 轴不从 0 开始**：要看的是年际变化（Zürich 10 万单身 17 年只差约 2'300），从 0 开始会是一条平线；表里有绝对值
- **`invalidate(kind)`**：输入变化时把对应请求的 seq 加一并 abort，否则用户切走页签后旧请求回来会把过期数据写进 `state.compare/curve/history`（v1 的比较页也有这个问题，一并修了）
- **同一方案 = 同一个 API 查询**：`sameHousehold(a, b)` 直接比较 `householdParams()` 生成的查询串，被口径或身份隐藏的字段自然不参与比较，和 CDN 缓存键同一个定义，不会两处漂移
- **方案从空列表开始，可以全部删除**：priminfo-pro 预置一个默认档案并要求至少保留一个；这里没保存过的「默认方案」反而让人困惑。因此删掉了 `toastKeepOneProfile`、`clickToLoad`；`lblInputs`（"Your household"）的位置被 Scenarios 标签取代，也删了
- **卡片与「当前」比较而不是与「激活方案」比较**：当前输入不一定属于任何已存方案，`diffVsActive` 改名 `diffVsCurrent`，文案为 "vs. current"
- **方案的数字在每次该方案的计算返回时刷新**：保存时若计算还没回来就存 `summary: null`，结果到达后按保存时的输入快照（`state.calcInputs`）匹配并补上
- **chip 标签和卡片都用 `<button>`**：priminfo-pro 是可点的 `div`，键盘用户无法切换方案
- **德语用瑞士写法**（ss、«»）且术语对齐 ESTV（steuerbares Einkommen、Grenzsteuersatz、Steuerfuss、Personalsteuer、Konkubinat）
- **`curveYouBadge`（"◀ you"）改为 `curveYouLabel(income)`**：标签贴边时会移到竖线左侧，箭头会指反；改为居中在竖线上方

## 遗留问题与下一步

- 见 `roadmap.md`
- 比较页柱状图仍是固定 820 viewBox，手机上字很小；可改用 `chartWidth()`
- 部分 aria-label / caption（"Filter places"、"Sort order"、"Language"、各表 caption 等）仍是硬编码英文，不在词典里
- v1 遗留的未使用代码，本次没动：`main.js` 导入的 `isCouple`、`saveActiveStateDebounced`；`en.js` 导入的 `fmtPct`；词典 key `errInvalidYob`、`secWealth`、`legendWealth`（de / zh 也照译了，以保持三份一致）
- 方案标签只含 城市 · 身份 · 孩子数 · 收入 · 年份，只差财富或教会的两个方案标签相同（卡片上的数字不同）
