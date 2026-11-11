# 261111 session：修复 replaceState 重载隐患并上线 Cloudflare Pages 纯 Serverless 双活部署

## 目标

1. 同步修复姊妹站 `../swiss-insurance-compare` 暴露的首屏 `history.replaceState` 在嵌入式 `WKWebView` 下的重载死循环隐患与静态资源缓存头缺失问题（复盘见 `../swiss-insurance-compare/.agents/docs/261111-vercel-cdn-limit.md`）
2. 新增 **Cloudflare Pages** 纯 Serverless 部署（`https://swiss-tax-compare.pages.dev`），并解决 `/api/savings?scope=capitals` 单次 79 个上游请求超出 Cloudflare 免费版 50-subrequest 硬上限的问题
3. 更新 `AGENTS.md`、`README.md` / `README-zh.md` 与 `roadmap.md`，推送 GitHub 远端并完成双平台生产验证

## 完成内容

- `61d3423`：
  - `static/js/state.js`、`controller.js`、`main.js`：增加 `newUrl !== currentUrl` 幂等守卫、合并首屏 `initApp()` 持久化调用、新增 `sessionStorage` 4 秒 4 次启动重载熔断器
  - `vercel.json`：为 `*.woff2` 配置 `1 年 immutable`、为 `*.css` / `*.js` 配置 `public, max-age=300, stale-while-revalidate=86400`
  - `tests/js/selected-compare.test.mjs`：新增幂等 `replaceState` 与快速重载熔断单测
- `0a2665d`：
  - `api/index.py`、`static/js/api.js`：`/api/savings` 新增可选 `cantons=1,2,...` 子集过滤（省略时仍默认全量 26 州，向后兼容）；前端 `fetchSavings(..., { capitals: true })` 拆为 `1–13` 与 `14–26` 两批并发请求后合并排名，每批最多 40 次上游请求，严格控制在 Cloudflare 免费版单次 50 个 subrequests 限制以内
  - `functions/api/[[path]].js`：将 `api/index.py` 全量接口、参数校验、并发控制、`caches.default` 边缘缓存与 `400` / `404` / `502` / `504` / `500` 状态码映射 1:1 移植为无依赖 Cloudflare Pages Function
  - `static/_headers`、`.gitignore`、`.vercelignore`：配置 Cloudflare 静态缓存头并隔离平台目录
  - `tests/test_api.py`、`tests/js/cf-functions.test.mjs`、`tests/e2e/savings.test.mjs`：补齐州子集单测、Pages Function 快照对齐测试（含 subrequest 计数断言 `< 50`）与 e2e 请求数断言
  - `AGENTS.md`、`README.md`、`README-zh.md`：补充双平台部署说明与防坑规范
- 生产验证：
  - 本地：`python3 -m unittest` 31 项通过，`node --test 'tests/js/*.test.mjs'` 21 项通过
  - 线上：Cloudflare Pages（`https://swiss-tax-compare.pages.dev`）与 Vercel（`https://swiss-tax-compare.vercel.app`）均已部署生效，验证静态缓存头、`/api/compare`（2'110 个市镇）及线上 Playwright e2e（`savings.test.mjs` 3 项，含 26 州府节税排名）全部通过

## 关键决策及原因

- **用户选：采用 Cloudflare Pages `.pages.dev` 免费域名部署**：兼顾无限免费静态请求配额与个人主域名隐私隔离
- **前端拆两批 `cantons=1..13` / `14..26` 适配 Cloudflare 50-subrequest 上限**：Cloudflare Workers 免费版对单次客户端请求触发的外部 `fetch` 硬上限为 50 次（原 26 州府 × 3 档 + 1 次 budget = 79 次必报错）；拆成两批（每批 40 次、单批并发 4、总并发仍为 8）既不触发 ESTV 连接拒绝限流，又保持本地、Vercel 与 Cloudflare 三端行为完全一致

## 遗留问题与下一步

- 见 `roadmap.md`「下一轮就做」（手机概览页卡片窄屏宽度、请求失败旧数字提示、v1 未使用代码清理）；后续修改后端接口或每年更新 `MAX_YEAR` / `PILLAR_3A_CAPS` 时需同步更新 `api/index.py` 与 `functions/api/[[path]].js`
