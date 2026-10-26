# 2026-10-26 session：05 Tax Savings

## 目标

新增「3a 缴费和 BVG 补缴能省多少税」页签：后端 `/api/savings`、前端页签、26 州府排名，提交并部署。无人值守运行，取舍自己决定。

## 完成内容

| # | 提交 | 内容 |
|---|---|---|
| 1 | `bede4d8` | `/api/savings`（`pillar3a`、`bvg`、`scope=capitals`）、`PILLAR_3A_CAPS` 常量并随 `/api/meta` 下发、05 Tax Savings 页签（输入 + 两个上限按钮、三档对比条、三档表、26 州府排名表）、三语词典、unittest（8 个）、calc 单测（2 个）、e2e `savings.test.mjs`（3 个）、AGENTS.md / README / roadmap |

### 部署与验证

- 生产：`dpl_4zu6jBrBm865xFj2trW3wAucyuBe`，别名 https://swiss-tax-compare.vercel.app
- 线上：`/api/calculate`、`/api/compare`、`/api/history` 200；`/api/savings` 200（单点 3.1 秒，26 州府 9.5 秒）；`pillar3a=-1` → 400；`/api/meta` 带 `pillar3aCaps`；页面含 `data-tab="savings"`
- 本地：unittest 30 通过，node 15 通过，e2e 21/21（限流冷却后一次跑完）；对线上跑 savings + tabs 的 e2e 7/7；桌面和手机（de）截图检查过

## 关键决策及原因

- **上游 `Budget` 能传扣除项**（已验证）：把 `API_calculateTaxBudget` 的完整列表原样传回、改 `PRAEMIEN3A` 的 `Value`，应税所得精确减去该金额（ZH 120k：102'574 → 95'316）。只传 `[{Ident, Value}]` 会被忽略。因此 gross 模式用真实差额，taxable 模式才用「应税所得 − 扣除额」调 Simple，页面按 `method` 注明口径
- **BVG 补缴记在 `UEBRIGEABZUEGE`（其他扣除）**：上游没有补缴专用条目。页面注明「补缴能否全额扣除取决于养老金的补缴额度」，不去模拟额度
- **预算列表只取一次**：ZH 与 GE 的列表相同，26 州府共用，省 25 次请求。仍是 1 + 26 × 3 = 79 次
- **并发 8，不是 compare 的 26**：开始用 13 时上游拒绝连接。并发降到 8 后 26 州府 4.2 秒（本地）
- **同一接口两个范围**：`scope=capitals` 才算排名。前端先请求所在地（快），再请求排名，避免首屏一次打 79 次；金额变化两者都重取，仅换地点时排名保留（只重新高亮）
- **`pillar3a` 缺省 = 当年有养老金者上限**（前端存 `null`，请求不带参数），不在前端重复写数字；两个按钮：有养老金者（置 `null`）、无养老金者（收入 20% 与上限取小，按输入收入估，不是净收入）
- **金额不按上限校验**，只显示上限说明：用户可能想看超额的假设；上限表随年份变，校验会误伤
- **「每 CHF 1 省」按各档自己的步长算**：3a 档 = 省税 / 3a 额，第三档 = 补缴那一步的增量 / 补缴额。不另调上游求边际税率，省请求
- **页签编号 05**：任务写 04，但 04 已是 History；Savings 排在 Guide 前，Guide 改为 06
- **3a 上限来源**：7'258 / 36'288（2025、2026 相同），curl 核对了 vermoegenszentrum.ch，ESTV / BSV 官方页面 curl 取不到（猜的 URL 全 404，搜索也没给出官方页）。2023、2024 的 7'056 / 35'280 来自记忆，未核对。数据由第三方页面佐证，已写进代码注释和 AGENTS.md
- **停掉旧 server**：8766 上有一个本项目更早 session 留下的 server（确认 cwd 后按 PID 停），否则测的是旧代码

## 遗留问题与下一步

- 见 `roadmap.md`；2027 年 3a 上限预计 7'373 / 36'864（媒体报道，未核对官方），明年维护时更新
- e2e 在上游限流时会因 502 失败：本次连续跑几轮加上 78 次请求的接口，把上游压到拒绝连接几分钟。冷却后一次跑完全过；没有改测试
- 26 州府排名在 Vercel 上要 9.5 秒，函数时限内能跑完，但慢；上游限流时可能超时（504）
- README 的「Planned next」一行是 v1 遗留，已过时，没有改
