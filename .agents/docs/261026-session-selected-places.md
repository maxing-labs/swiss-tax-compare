# Session：02 Compare Places 自选地点

- 日期：2026-10-26
- 目标：默认手动选择少量地点比较，减少从 2'110 个市镇排名中找城市的负担；保留旧排名入口、零依赖和现有分层。
- 开始先读 `AGENTS.md`、`roadmap.md`、最新 P1 复核 / Tax Savings session，确认四项 P1 均已完成；检查 compare、地点搜索、状态持久化和 `/api/calculate`。

## 完成内容与提交

| 提交 | 内容 |
|---|---|
| `8741d25` | 默认自选地点、共享地点搜索、BFS 去重、最多 6 个地点的 chips、柱状图与简表、同一家庭参数的 gross / taxable、逐点加载 / 失败 / 重试、取消与旧请求保护、localStorage / URL 保存、en / de / zh、单测与浏览器回归、AGENTS / README |
| `da7b46f` | 自选表格自然展开，手机可沿页面阅读全部 6 个地点，避免继承排名表的内部滚动；补浏览器断言 |

- 当前所在地固定为第一枚 chip，最多添加 5 个额外市镇；不足两个地点提示添加。换所在地后替换固定 chip，自动去除重复市镇。
- 全瑞士 / 单州 / 州府排名移至「查看地点排名」，原筛选、排序、CSV 和 Use 保留。
- 自选表列：地点、年度总税、实际税率、税后收入、相对所在地税额差；标记所在地和最低者。有未完成 / 失败地点时标「已加载中最低」，所在地失败时差额显示「—」。
- 输入变化后清除自选旧数字；隐藏页签只失效，重新进入时加载。单点失败不影响其他地点，重试复用成功结果。
- 手机搜索和移除按钮支持触摸；chip 换行、移除按钮 44px，柱图沿用现有窄屏绘制，表格为卡片。

## 关键决策

- **复用 `/api/calculate`，后端零改动**：它已提供两种收入口径和税后收入所需的 `p1/p2.net`。选几个地点只请求几个地点；所在地与概览共享在途或已成功的计算，添加 / 移除 / 重试复用相同家庭参数的成功行。gross 每地点一次上游调用，taxable 因既有边际税率差分为两次；仍远少于全州排名。
- **分开结果状态**：`selectedCompare` 存自选行，原 `compare` 保留排名；两者均按现有 controller 调度。`AbortController`、请求序号和结果对象身份共同拦截旧响应；过期失败也不会覆盖状态徽章。
- **所在地固定**：总数上限包含所在地，保证差额有明确基线。`comparePlaces` 只存额外地点，按 BFS ID 去重，多个邮编不会占多个名额。
- **延续持久化**：额外地点以 `places` JSON 随现有 URL / localStorage 保存。旧存储默认迁移到自选；显式旧分享链接的排名范围保留。收到不含 `places` 的外部 URL 时清空本机额外地点，避免混入另一位访客的选择。
- **税后收入与概览一致**：gross = 扣社保 / 养老金后的净收入 − 年度总税；taxable = 输入应税所得 − 年度总税，三语均说明后者并非实际到手工资。实际税率分母为对应口径的输入收入。
- **保留并行会话的手机 header 修复**：开始已有的 `main.js` / `style.css` 修改随后由另一会话提交为 `8694c34`，其 session / roadmap 更新为 `859eb26`。本轮基于这些提交继续，部署使用 `git archive <commit>` 的干净快照。

## 验证

- `python3 -m unittest`：30 通过；首次沙箱执行因禁止 socket bind 失败，获准在沙箱外运行通过。
- `node --test 'tests/js/*.test.mjs'`：18 通过，新增 3 项覆盖市镇去重 / 上限、存储与 URL 迁移、税后收入口径。
- 本地完整 `tests/e2e/*.test.mjs`：32 通过，0 跳过；最终手机展开修整后，compare + selected-compare 的 11 项另跑通过。
- 最终生产别名上的 `selected-compare`、`compare`、`tabs`、`lang`：18 通过，0 跳过；新增自选用例用 mock 稳定覆盖故障 / 延迟，另用真实接口完成截图和请求量检查。
- 真实接口：默认所在地与 Zug 共 2 次 `/api/calculate`，逐步添加至 6 地点共 6 次，均未请求 `/api/compare`。Bernex（非州府）在 taxable 下正常得到结果。
- 三语桌面 1280px / 手机 390px 截图已检查：搜索下拉、chips、两地点 / 六地点图表、完整结果卡片、排名次级入口、taxable 文案；无横向溢出，无 console warning / error 或 pageerror。
- 本地截图：`/private/tmp/swiss-tax-selected-compare/local/`；最终线上截图：`/private/tmp/swiss-tax-selected-compare/production/`，各有 10 张和 `report.json`。核验脚本为同目录根下 `verify.mjs`。

## 部署与线上核验

- 从 `da7b46f` 干净快照运行 `vercel deploy --prod --yes`。
- 最终部署：`dpl_Vg1hy3uNXpbaYAj9KeQvbJYNwbm5`，READY / production。
- 部署地址：https://swiss-tax-compare-638eybca9-jddymx-8366s-projects.vercel.app
- 生产别名：https://swiss-tax-compare.vercel.app
- 首页、CSS、8 个相关 JS 文件均 HTTP 200，SHA-256 与 `da7b46f` 快照一致；记录在 `/private/tmp/swiss-tax-selected-compare/production-http.json`。
- 初次部署 `8741d25` 为 `dpl_CG8gt7NfE7cWh5pHiYCzTkc85eW6`；截图验收后仅补了手机表格展开，再部署上述最终版本。

## 遗留问题与下一步

- 本轮需求已完成，没有新增依赖或后端接口。
- 排名模式仍沿用全瑞士批量接口；taxable 排名限州府，自选不受此限制。
- 原有独立问题继续见 `roadmap.md`：手机概览卡片溢出、概览请求失败后的旧数字、未使用代码清理；本轮未扩大范围。
