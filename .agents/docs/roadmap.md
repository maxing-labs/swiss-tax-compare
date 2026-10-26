# Roadmap

v1（2026-10-26）：输入表单、01 Your Tax、02 Compare Places、Tax Guide，英文。
P1（2026-10-26，见 `261026-session-p1-curve-history-scenarios-i18n.md`）：03 Income Curve、04 History、保存方案、de / zh，全部已上线。
P1 收尾（2026-10-26，见 `261026-session-p1-e2e-mobile-chart-aria.md`）：`tests/e2e/` 收进仓库、比较页柱状图适配手机、aria-label / caption 进词典，已上线。

## 下一轮就做

1. **手机 header 重叠**：390px 下状态徽章 "Data loaded" 压在 "SWISS TAX COMPARE" 标题上（P1 加回语言按钮后就有）；可在窄屏隐藏徽章文字只留圆点，或把徽章挪到第二行
2. **上游连接错误返回 500**：`api/index.py` 的 `error_status` 只把 `EmptyResultError` 映射到 502，`URLError`（上游限流时的 `Connection refused`）落到 500 并打印 traceback；应映射到 502 / 504、不带缓存头，必要时对单个上游调用重试一次。本地连续跑 e2e 时会触发上游拒绝连接，生产在并发高时也可能遇到
3. **图表标题占位文本**：`compare-chart-title` / `curve-chart-title` / `history-chart-title` 的 HTML 初始文本是英文，de / zh 下在页签首次加载完成前可见；给占位文本加 key

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
