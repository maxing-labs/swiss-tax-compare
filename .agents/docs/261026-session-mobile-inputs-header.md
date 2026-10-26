# Session：手机输入区挡住正文

- 日期：2026-10-26
- 用户反馈：手机上要先收起输入区才能看到正文，建议给输入框加阴影，提示要点右上角收起

## 目标

手机上不收起输入区也能看到正文；收起后的状态要直观。

## 完成内容

| 提交 | 内容 |
|---|---|
| `8694c34` | ≤768px：输入区展开时 `.swiss-header` 改为 `position: static`，随页面滚走；收起后（154px）仍吸顶，并加底部阴影（`0 8px 20px`，与下拉框相同）。在页面下方点「展开输入」时滚回顶部。`tests/e2e/mobile-inputs.test.mjs` 2 个测试 |

- 测量：390×844 下，输入区展开时 header 高 544px（单身，占 64%）/ 715px（已婚两人，占 85%），整个 header 吸顶，正文只能在底部约 300 / 130px 里滚动
- 测试：`python3 -m unittest` OK，`node --test 'tests/js/*.test.mjs'` 15 通过，e2e 23 通过（本地和线上）
- 截图：手机展开后下滑（正文占满屏幕）、收起后下滑（header 吸顶带阴影）、桌面下滑（不变）

### 部署

- 第一次 `vercel deploy --prod --yes`（`dpl_FUGpAJfYeEqBmMsUSr1GoGkDFgQA`）从工作目录上传，带上了另一个 session 还没提交的 `state.js` 改动（比较页「选定地点」）。发现后用 `git archive 8694c34` 导出到临时目录、复制 `.vercel/`，再部署一次 → `dpl_2rnbfDBHVvhii1zRoFT2HLikgmfq`。线上 `state.js` 已不含 `comparePlaces`，对线上重跑 e2e 23/23 通过。错误版本在线上约 3 分钟

## 关键决策及原因

- **用户选了「展开时不吸顶 + 阴影」**，没有只加阴影：只加阴影的话，输入区仍挡住大半屏。也没有用「滚动时自动收起」：自动收起时页面会跳一下，用户也可能不知道输入去了哪里
- **用 CSS `:has()` 根据 `.profile-bar.is-collapsed` 切换**，不在 JS 里给 header 加 class：折叠按钮的处理逻辑不用改
- **展开时滚回顶部**：收起状态下滑到页面中部再点「展开输入」，header 会变回 static，回到页面顶部，不滚回去就看不到刚展开的输入框
- **多个 session 同时改这个仓库时，部署要用 `git archive HEAD` 导出的干净目录**：`vercel deploy` 上传的是工作目录，不是 git HEAD

## 遗留问题与下一步

- 见 `roadmap.md`
- 手机概览页 `.chart-card` 比视口宽（约 468 / 390px），右侧被裁掉，v1 起就有
- 展开状态下滑到正文后，页签也跟着滚走了，要切页签得先回到顶部
