# 界面方向探索（2026-11-06 / 11-07）

这些文件是给「首页该长什么样」做过的 **7 个视觉方向**，全部用真实数据渲染（17 个已平仓位、
96 次动作、四分区消息），不是占位图。它们**不是生产界面**，生产界面在 `web/`。

保留它们的原因：定稿时可以直接拿某一版当设计稿，或者用 `compare_design` 拿来做像素级比对。

## 文件

| 文件 | 方向 | 气质 | 结论 |
| --- | --- | --- | --- |
| `dashboard/home-a.html` | A 交易终端 | 纯黑 #05080B、等宽字、密排表格 | 用户认可气质，但「太专业、太密」 |
| `dashboard/home-a2.html` | A2 交易终端（改良） | 降密度、左仓位生命周期 + 右信息流 | 用户反馈「不够优美」，停在原地 |
| `dashboard/home-b.html` | B 仓位档案 | 暖灰、衬线标题、横向时间轴 | 未选中 |
| `dashboard/home-c.html` | C 指挥台 | 沿用产品现有 token 的演进路线 | 未选中 |
| `dashboard/home-paper.html` | 纸面账本 | 暖白 #FAF7F1、Noto Serif SC、报纸双栏 | 用户反馈「不够优美」 |
| `dashboard/home-swiss.html` | 清算所 | 纯白、Helvetica、左侧仓位清单反白 | 未选中 |
| `dashboard/home-tint.html` | 日间工作台 | 冷白 #F4F6F9 + 白卡 + 蓝条 | 未选中 |

`dashboard/data.json` 是渲染这些页面用的中间数据（由 `aoying.db` 解析而来），
`replay_at` 字段是「同时持仓最多」的时刻：2026-10-23 22:56:12，当时 2 仓。

`../prototypes/frontend-v1.html`（2026-11-06）是第一版，用真实消息但仍是「标准后台表格」，
用户评价「太老土、排版很怪」。`../prototypes/frontend-v2.html` 是「深色交易磁带」改版。

## 若要继续做界面

1. 先定方向，再谈细节——7 个方向里没有一版被明确接受，说明**气质和密度还没对齐**。
2. 用右侧「设计工作台」`preview_page` 打开并排看，`check_design` 量问题，别靠截图猜。
3. 首页必须同时承载两件事：**仓位生命周期跟踪** + **多来源信息同步**（用户 m02661 的原话）。

## 生成脚本

这些 HTML 由 `.tools/tmp/` 下的 `design_directions.py`、`design_a2.py`、`design_light.py`
生成，脚本随 `aoying.db` 一起跑，不入库（`.tools/` 已在 `.gitignore` 里）。
