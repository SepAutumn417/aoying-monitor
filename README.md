# 熬鹰资本监控系统

独立新项目，需求与阶段验收见 [整体规划](docs/MASTER-PLAN.md)。

## 当前范围

监控熬鹰资本在 Telegram 四话题、X、Fomo、OKX 的可获取信息；仓位变化及时通知红米 K50。通知采用自建 Gotify，先验证大陆无 VPN 的真实到达能力。AI 分析为后续阶段，当前不执行交易。

## 项目隔离

- 本地：F:\aoying-monitor
- GitHub：计划使用独立私有仓库 aoying-monitor，尚未创建。
- 服务器：计划 /opt/aoying-monitor、独立账号与 systemd 服务。
- 数据、凭证、Gotify 数据与旧项目完全分开。
- 不复制旧项目 .env、Telegram session、数据库或交易所凭证。
- 新 Telegram 登录不能直接复用正在生产运行的 session；实施前确定独立会话或受控切换方案。

## 状态

规划基线已创建；尚未上传 GitHub 或部署服务器。
