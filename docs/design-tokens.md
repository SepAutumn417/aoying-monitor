# 设计 Token

Web（Tailwind 4，`web/src/styles.css`）与 Android（`app/lib/theme.dart`）共用同一套语义色，
保证两端看起来是同一个产品。

## 颜色

| Token | 值 | 用途 |
| --- | --- | --- |
| `ink` | `#0A0E12` | 页面底色 |
| `panel` | `#11171F` | 卡片/面板 |
| `panel-raised` | `#151D26` | 浮起面板、hover |
| `border` | `#22303D` | 分割线与卡片描边 |
| `mist` | `#8A99A8` | 次要文字、标签 |
| `mist-bright` | `#C9D4DF` | 正文 |
| `signal` | `#3DDC97` | 主色/在线/成功 |
| `amber` | `#F5B84B` | 待办/警告/推断数据 |
| `danger` | `#FF6B6B` | 错误/亏损 |

## 排版

- 标题：`headline-small` 22px / 600；Web 为 `text-2xl` 起。
- 正文：13px / 行高 1.5。
- 标签：10–11px，字距 0.8–2.0，全大写用于 eyebrow 与状态。
- 数字统一等宽（Web `font-mono`，Flutter `FontFeature.tabularFigures`），避免跳动。

## 间距与圆角

- 间距基数 4：8 / 10 / 12 / 16 / 18 / 24。
- 卡片圆角 12–14，胶囊状态 20，输入框 10。

## 组件约定

- 每个页面顶部固定 `PageHeader(eyebrow, title, subtitle)`。
- 状态一律用 `StatusChip`（ok / pending / warn），不用纯色块。
- 空状态必须说明“为什么空”和“哪个增量会填上”，不能只写“暂无数据”。
- 数据必须标注来源与置信度；推断数据用 amber，不用 signal。
