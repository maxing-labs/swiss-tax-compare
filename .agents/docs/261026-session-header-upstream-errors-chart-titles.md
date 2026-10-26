# Session：手机 header 重叠、上游连接错误的状态码、图表标题占位文本

- 日期：2026-10-26
- 用户要求：按 roadmap「下一轮就做」的顺序做：1）390px 下状态徽章压住标题，先看 360 / 390、en / de / zh、ready / loading / error 的截图再选改法，桌面不变；2）上游 `URLError` / 超时从 500 改成 502 / 504，不带缓存头，只记一行 warning，先写 unittest 复现；说明是否重试的取舍；可加 502 的 e2e；3）三个图表标题的英文占位文本加 key，lang e2e 要能抓到。每项跑三套测试、截图、提交；全部完成后发生产、`vercel inspect` 确认别名、对线上重跑 e2e；写 session 记录、更新 roadmap

## 完成内容

| # | 提交 | 内容 |
|---|---|---|
| 1 | `3e8a1de` | ≤ 640px 状态徽章缩成状态色圆点（文字留在 DOM 里给读屏），≤ 380px 标题 0.95rem → 0.88rem，标题在更窄的屏上换行而不是压住按钮；新增 `tests/e2e/header.test.mjs`（360 / 390 × 三语 × 三种状态，标题右边 < 徽章左边、无横向滚动） |
| 2 | `eb8ee30` | `error_status`：`TimeoutError`（直接抛出或作为 `URLError.reason`）→ 504，`URLError` / `ConnectionError` → 502；两个 handler 原有的「500 才打 traceback」逻辑不变，所以这些只记一行 warning；unittest mock `urlopen` 覆盖拒绝连接、连接重置、连接前 / 后超时 × 两个 handler；e2e 用 `page.route` 回 502，检查徽章变成 error 并弹 toast；AGENTS.md 的 CDN 缓存约定补上这两种状态码 |
| 3 | `598310a` | 新 key `compareChartPlaceholder` / `curveChartPlaceholder` / `historyChartPlaceholder`（三语），`index.html` 用 `data-i18n` 接上；history 占位文本去掉写死的「2010–2026」；`views/compare.js` 导出 `CHART_BARS` 供测试算期望标题；`lang.test.mjs` 新测试；`i18n.test.mjs` 的静态检查覆盖图表标题 |

### 部署

- 生产：HEAD `598310a`，`vercel deploy --prod --yes`（一次）→ `dpl_7Px7bMDgAwwPzcmS4saD3xgCnLop`；`vercel inspect` 确认别名 https://swiss-tax-compare.vercel.app
- 线上 `index.html` 含 3 个 `ChartPlaceholder`，`style.css` 含圆点样式，`de.js` 含新 key，`compare.js` 导出 `CHART_BARS`，JS 为 `application/javascript`；`/api/calculate?status=9` → 400，无 `s-maxage`
- `BASE=https://swiss-tax-compare.vercel.app` 重跑 e2e：18/18 通过

### 验证

- `python3 -m unittest`：22 通过（+1）；`node --test 'tests/js/*.test.mjs'`：13 通过；e2e 本地 18/18（+3），server 日志无 `Connection refused`
- 每个新测试都做过反向验证：撤掉 CSS 改动，header 测试报「360px en statusReady: title ends at 218, badge starts at 148」；改代码前 unittest 全部是 500；去掉三个 `data-i18n`，静态检查报 `no data-i18n`，e2e 报 `expected 'Steuer total nach Ort'`，`actual 'Total tax by place'`
- 截图：header 在 320 / 360 / 375 / 390 / 430 / 640 / 641 / 768 / 769 / 1280 × 三语 × 三种状态逐一量过（标题右边与徽章左边的距离、页面宽度），1280 的 header 截图与改前逐字节相同（9 张里 1 张不同，差异只在输入框光标处）；502 时桌面「Load failed」徽章 + toast、手机红点 + toast；图表标题桌面 + 手机，de / zh 加载中与加载后

## 关键决策及原因

- **header：窄屏只留圆点**，没有把徽章挪到第二行。改前 390px 下标题与操作区要 391–459px（实测；de「Laden fehlgeschlagen」最长），内容区只有 363px；圆点省下 49–118px，390px 下留出 29px 间距。挪到第二行会让手机 sticky header 再高一行，而它已经很高（见遗留问题）。断点用项目已有的 640px，641–768px 之间完整徽章放得下（de error 时间距 162px）
- **360px 还差 1px**，所以 ≤ 380px 时标题缩到 0.88rem（间距 11px）；再窄（320px）时标题换成两行（header 45 → 59px），保证任何宽度都不重叠，而不是截断品牌名
- **圆点用 `text-indent: 100%` + `overflow: hidden` 隐藏文字**，不用 `font-size: 0`（部分读屏会跳过）。loading 只是变成琥珀色、没有动画；error 时同时有 toast
- **超时分两处判断**：`urlopen` 在连接阶段超时会包成 `URLError(reason=TimeoutError)`，在等响应头 / 读 body 时超时直接抛 `TimeoutError`（`getresponse()` 不在 `urllib` 的 `try` 里）。同理，`RemoteDisconnected` / `ConnectionResetError` 也不经 `URLError`，所以 502 的条件里加了 `ConnectionError`，这是比 roadmap 原文多做的一点
- **单个上游请求不重试**：
  - 好处：compare 的 26 个并发请求里只要一个失败整页就失败，重试能救回偶发的单次失败
  - 坏处：拒绝连接是上游在限流，上次日志里持续几秒到几分钟，立即重试大多仍失败，却让请求量翻倍（compare 26 → 52），加重限流；超时重试把最坏响应时间从 20 秒拉到 40 秒以上
  - 错误响应不缓存，用户改输入或刷新就会重新请求；所以先不重试，若生产日志里常见孤立的单次失败再加（只对连接错误、带退避）
- **e2e 用闸门而不是固定延迟**：`page.route` 让请求等一个 Promise，读完标题再放行，然后 `route.fallback()` 交给 `lib.mjs` 的磁盘缓存（`continue()` 会绕过缓存直连上游）。不依赖延迟时长，不会因机器慢而不稳
- **期望标题在页面里用同一份词典函数和 `state` 算出**（地点、年份、`CHART_BARS`），不写死文本，上游数据更新后不用改测试
- **本地 server 重启**：`pkill -f "python3 server.py"` 会连带其他姊妹项目的 server，被权限拦下；改用 TaskStop 只停本 session 启动的后台任务

## 遗留问题与下一步

- 见 `roadmap.md`
- **手机 sticky header 太高**（截图时发现，既有问题）：输入区展开时整个 header 高 544px（视口 844px），滚动时一直钉在顶部，内容区只剩约 300px；折叠后 154px
- 请求失败时概览页仍显示上一次成功的数字，输入框却已是新值，只有徽章 / toast 提示
- 上游返回 200 但 body 不是 JSON 时 `json.loads` 抛 `ValueError`，仍是 500 + traceback（没遇到过，未处理）
- v1 遗留的未使用代码仍未动（`isCouple`、`saveActiveStateDebounced` 的导入，`fmtPct` 导入，`errInvalidYob` / `secWealth` / `legendWealth`）
