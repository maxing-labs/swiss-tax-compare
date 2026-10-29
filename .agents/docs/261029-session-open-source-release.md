# 261029 session：正式开源到 maxing-labs

## 目标

补充中英文 README、高清桌面端截图、姊妹项目双向互链，统一默认分支为 `main`，并将仓库发布到 GitHub 组织 `maxing-labs/swiss-tax-compare`。

## 完成内容

- 默认分支由 `master` 重命名为 `main`
- `20eac7c`：
  - 新增 `docs/screenshot.png`（01 税负概览与扣除明细）与 `docs/screenshot-compare.png`（02 六市镇税负横向对比：Zug / Zürich / Basel / Genève / Bern / Lausanne），由无头 Chromium 在 1280×860 @ 2x Retina 视口下对生产环境实拍
  - 新增 `README-zh.md` 中文说明，并在 `README.md` 与 `README-zh.md` 顶部加入中英文切换及姊妹项目 `Swiss Insurance Compare`（线上与 GitHub `maxing-labs/swiss-insurance-compare`）互链
- 创建公开仓库并推送：`https://github.com/maxing-labs/swiss-tax-compare`

## 关键决策及原因

- **放在 `maxing-labs` 组织下（用户选）**：与 `maxing-labs/swiss-insurance-compare` 成对发布
- **默认英文 `README.md` + 独立 `README-zh.md`（用户选）**：兼顾瑞士本地/国际读者与中文读者

## 遗留问题与下一步

- 见 `roadmap.md`
