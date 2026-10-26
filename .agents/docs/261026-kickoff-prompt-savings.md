先读 AGENTS.md、.agents/docs/roadmap.md 和最新的 session 记录，再看 api/index.py 里 Detailed 接口的调用和 `Budget` 字段。

目标：给 Swiss Tax Compare 加一个 04 Tax Savings 页签（3a 缴费和 BVG 补缴能省多少税），提交并部署。

1. 先验证上游：`API_calculateDetailedTaxes` 的 `Budget` 数组怎么传扣除项（在 ESTV 官方前端包里找字段名和扣除类型枚举，或对比传与不传的 TaxableIncome 差值）。能传则用「含扣除 − 不含扣除」的真实差额；不能传则用「应税所得 − 扣除额」再调 Simple 接口的差分，并在页面注明口径
2. 后端新增 /api/savings?…现有家庭参数…&pillar3a=&bvg= → 返回不扣 / 扣 3a / 扣 3a+BVG 三档的总税、省税额、每 1 法郎省多少（边际）；2026 年 3a 上限（有养老金者与自雇者两档）写成常量并注明来源 ESTV / BSV 页面，上线前 curl 官方页面核对数字
3. 前端 04 Tax Savings：输入 3a 金额（默认上限）和 BVG 补缴金额 → 三档对比条 + 省税额；下面放 26 州州府在同一输入下的省税额排名（并行调用，复用 compare 的结构）
4. 现有测试必须全过，新增离线测试覆盖 savings；`vercel deploy --prod --yes` 后验证线上旧页签和新接口；更新 AGENTS.md / README / roadmap，写 session 记录。本次无人值守运行，取舍自己决定并记进「关键决策」，不要停下来等回答。
