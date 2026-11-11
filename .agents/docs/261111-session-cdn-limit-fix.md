# 261111 session：同步修复首屏 replaceState 重载死循环隐患与静态缓存头

## 目标

姊妹站 `../swiss-insurance-compare` 因第三方客户端内嵌 `WKWebView` 触发首屏 `history.replaceState` 重载死循环 + 静态 ES 模块默认 `max-age=0` 校验放大，单 IP 刷满 Vercel Hobby 100 万次 CDN 请求额度（详见 `../swiss-insurance-compare/.agents/docs/261111-vercel-cdn-limit.md`）。本站具有完全一致的状态同步结构，同步打上防护补丁。

## 完成内容

- `61d3423`：
  - `static/js/state.js`、`controller.js`、`main.js`：
    - `saveActiveStateToStorageAndUrl()` 增加 `newUrl !== currentUrl` 幂等守卫，URL 未变化时不调用 `history.replaceState`
    - `initApp()` 首屏初始化时 `applyLanguage` 与 `switchTab` 传 `{ persist: false }`，避免启动阶段重复改写 URL
    - 新增基于 `sessionStorage` 的 4 秒滑动窗口重载熔断器（4 秒内连续启动达 4 次时抑制首屏 `replaceState`）
  - `vercel.json`：为 `*.woff2` 配置 `public, max-age=31536000, immutable`；为 `*.css` / `*.js` 配置 `public, max-age=300, stale-while-revalidate=86400`
  - `tests/js/selected-compare.test.mjs`：新增幂等 `replaceState` 与快速重载熔断单测
- 验证：`python3 -m unittest` 30 项通过，`node --test 'tests/js/*.test.mjs'` 19 项通过，Playwright e2e（`selected-compare` + `status-badge`）11 项通过

## 关键决策及原因

- 与 `../swiss-insurance-compare` 保持一致的双层防护（幂等守卫 + 4 秒 4 次启动熔断）及 `vercel.json` 分层缓存策略，兼顾地址栏直接复制分享与嵌入式 WebView 兼容性
- 暂未部署生产与推送远程，待用户确认后续托管方案后统一执行

## 遗留问题与下一步

- 待用户确认后执行 `vercel deploy --prod --yes` 与 `git push`
- 若后续迁移至免费版 Cloudflare Pages / Workers，需注意 `/api/savings?scope=capitals` 单次会向 ESTV 发起 78 次请求（超过免费 Worker 单次 50 个 subrequest 上限），届时可将 26 州府拆成 2 批前端并发请求
