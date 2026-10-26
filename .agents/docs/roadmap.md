# Roadmap

v1（2026-10-26）只做了：输入表单、01 Your Tax、02 Compare Places、03 Tax Guide，英文。
后端已经实现并有测试、但前端还没用上的接口：`/api/curve`、`/api/history`。

## P1 下一轮就做

1. **03 Income Curve 页签**：`/api/curve` 已返回 18 个收入点（2 万–50 万，含用户自己的收入）的总税、边际税率、应税所得。画有效税率 + 边际税率两条线（SVG，参考 priminfo-pro 的 `views/curves.js`），竖线标用户收入，下面放表（收入 / 总税 / 有效 / 边际 / 税后）。`calc.js` 的 `curveSeries` 已写好并有测试。`en.js` 里 `curve*` / `legendEffective` / `thIncome` 等 key 已经有了
2. **04 History 页签**：`/api/history` 返回 2010–2026 每年的总税（同一套输入套到各年税率上）。折线 + 表（年份 / 总税 / 同比）。`calc.js` 的 `historySeries` 已写好并有测试；`en.js` 里 `historyChartTitle(loc, y0, y1)` 等 key 已有
3. **保存方案（Scenarios）**：照 priminfo-pro 的 profiles（chips + 卡片 + localStorage），卡片显示总税、有效税率、与当前方案的差额。典型用法：单身 vs 已婚、搬家前后、加薪。`state.js` 里曾有一版 `HOUSEHOLD_KEYS` / `sameHousehold` 的设计（v1 为了精简去掉了），可参考 git 历史之外的这段说明：同一方案 = 地点 id + 年份 + 身份 + 孩子 + 教会 + 口径 + 收入字段都相同，被口径或身份隐藏的字段不参与比较
4. **de / zh 词典**：复制 `en.js` 的全部 key 翻译，`i18n/index.js` 导出三种，`index.html` 加回 `中 / DE` 按钮。扣除明细上游自带 DE/FR/IT/EN，`views/overview.js` 的 `DEDUCTION_LANG` 映射里 zh 回落到 en

## P2

- 比较页图表：范围为单个州时柱数可能到 160，目前只画最低 20 + 本地；考虑加「最高 N」或按州聚合（每州中位数）
- 比较页「Use」把某市镇设为所在地后，`locationName` 只有市镇名、没有邮编；可在 `/api/compare` 行里带 `ZipCode`（上游全州批量接口不返回邮编，需要再查一次 `API_searchLocation`）
- 手机端：输入区很高，默认折叠或改成两段式；表格在 390px 下用卡片布局（compare 表已有，breakdown 表故意关掉了）
- 边际税率口径：gross 模式用上游 `MarginalTaxRate`（按应税所得），taxable 模式用 +1'000 的差分，两者定义不完全一致；About 里已说明，可考虑统一为差分
- 财富税的说明文案（`wealthNote`）只在 wealth > 0 时显示；可加一张「财富税免税额」的指南卡
- e2e 测试：参考 priminfo-pro 的 `tests/e2e/`，用 playwright-core + `page.route` 模拟接口失败和慢响应
- 年度维护：每年 ESTV 更新后改 `api/index.py` 的 `MAX_YEAR`，跑 `python3 -m tests.make_fixtures`

## 不做 / 待定

- 资本提取税、遗产税、法人税：上游有接口（`API_calculateManyCapitalTaxes` 等），但和本站「所得 + 财富」定位不同
- 自定义扣除项（上游 `Budget` 数组）：上游支持，但表单会变得很长；先看用户是否需要
- GitHub 远程仓库：目前只有本地 git，与 priminfo-pro 一样等用户决定
