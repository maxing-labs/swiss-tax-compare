# Roadmap

v1（2026-10-26）：输入表单、01 Your Tax、02 Compare Places、Tax Guide，英文。
P1（2026-10-26，见 `261026-session-p1-curve-history-scenarios-i18n.md`）：03 Income Curve、04 History、保存方案、de / zh，全部已上线。

## P1 下一轮就做

1. **比较页图表适配手机**：曲线和历史图已用 `chart-theme.js` 的 `chartWidth()` 按容器像素宽度绘制，比较页柱状图还是固定 820 viewBox，手机上字很小
2. **剩余硬编码英文**：`index.html` 里的 aria-label（"Filter places"、"Sort order"、"Language"、"Inputs"、各 SVG）和表格 caption 不在词典里；补 key 后用 `data-i18n-aria` / `data-i18n`
3. **e2e 测试**：本次的浏览器脚本在 `/tmp/swiss-tax-p1/`（会被清掉），可参照 priminfo-pro 的 `tests/e2e/` 收进仓库：状态徽章、页签懒加载与失效、方案保存 / 切换 / 删除、缺年份的历史、词典残留检查

## P2

- 比较页图表：范围为单个州时柱数可能到 160，目前只画最低 20 + 本地；考虑加「最高 N」或按州聚合（每州中位数）
- 比较页「Use」把某市镇设为所在地后，`locationName` 只有市镇名、没有邮编；可在 `/api/compare` 行里带 `ZipCode`（上游全州批量接口不返回邮编，需要再查一次 `API_searchLocation`）
- 手机端：输入区很高，默认折叠或改成两段式；表格在 390px 下用卡片布局（compare 表已有，breakdown 表故意关掉了）
- 边际税率口径：gross 模式用上游 `MarginalTaxRate`（按应税所得），taxable 模式用 +1'000 的差分，两者定义不完全一致；About 里已说明，可考虑统一为差分
- 财富税的说明文案（`wealthNote`）只在 wealth > 0 时显示；可加一张「财富税免税额」的指南卡
- 方案标签只含 城市 · 身份 · 孩子数 · 收入 · 年份；只差财富或教会的两个方案标签相同，需要时可加财富 / 教会简写
- 曲线页：可加「加薪 / 3a 缴款能省多少」的小计算器（边际税率已有）
- 年度维护：每年 ESTV 更新后改 `api/index.py` 的 `MAX_YEAR`，跑 `python3 -m tests.make_fixtures`

## 不做 / 待定

- 资本提取税、遗产税、法人税：上游有接口（`API_calculateManyCapitalTaxes` 等），但和本站「所得 + 财富」定位不同
- 自定义扣除项（上游 `Budget` 数组）：上游支持，但表单会变得很长；先看用户是否需要
- GitHub 远程仓库：目前只有本地 git，与 priminfo-pro 一样等用户决定
