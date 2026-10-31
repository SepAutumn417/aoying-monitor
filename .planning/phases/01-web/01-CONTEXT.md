# Phase 1: 服务端与Web可用基础 - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning; execution requires user approval
**Source:** PRD Express Path (.planning/REQUIREMENTS.md + ROADMAP.md Phase1)，使用用户已明确的需求，不另行假设App优先。

<domain>
## Phase Boundary
只规划AUTH-01/DATA-01/WEB-01/OPS-01：安全登录、持久化原文/版本/事件、基础时间线和详情、来源状态、HTTPS非root部署方案。
交付方案可执行，但本轮禁止实现代码、安装依赖、变更服务器或部署。用户审核方案后才开发。
阶段1执行时用明确标记的合成事件跑通可用Web；不能冒充真实Telegram/X/Fomo/OKX监控已上线。
</domain>

<decisions>
## Locked Decisions
- **D-01:** v1先服务端和Web，手机App及AI后置；不包含自动交易、Gotify或第三方通知SaaS。
- **D-02:** 用户个人私有使用，需要登录退出、受保护接口和清晰错误，不做多租户注册系统。
- **D-03:** 原文及编辑版本、标准事件持久化去重，重启恢复；对后续动态仓位比较保留依据，不把行情刷新当操作。
- **D-04:** Web具备登录、时间线、详情、来源/系统状态；合成数据标注、未接入来源标注未接入，不能显示“健康”或“空仓”。
- **D-05:** HTTPS正常校验、非root、凭证不入Git/日志，在真实数据接入前落实；自建不等于端到端加密。
- **D-06:** 每阶段方案确认后执行。新仓库独立、保留原型证据，旧项目只读参考，不复制旧session/凭证。
- **D-07:** 失败、无数据、未接入、加载中分别表达；Web不保证锁屏后台叫醒。

## Agent Discretion — proposed, not user-locked
技术栈/数据库迁移、会话实现、目录、API、分页与更新策略由研究推荐，明确理由与替换成本。
界面建议中文、中性色、桌面优先兼容手机浏览器、无装饰行情图；具体设计随详细方案供用户确认。
若可用基础只需轮询，则不为未来App提前开发设备WSS；但统一事件接口须可扩展。
</decisions>

<canonical_refs>
- F:/aoying-monitor/AGENTS.md — 项目与GSD约定。
- F:/aoying-monitor/.planning/PROJECT.md — 当前目标与隐私边界。
- F:/aoying-monitor/.planning/REQUIREMENTS.md — Phase1四条需求，其他不引入本阶段。
- F:/aoying-monitor/.planning/ROADMAP.md — Web优先阶段边界。
- F:/aoying-monitor/.planning/codebase/ARCHITECTURE.md — 当前只有同步SQLite原型。
- F:/aoying-monitor/server/aoying/events.py — 原型需评估复用/迁移，不代表已实现生产模型。
- F:/aoying-monitor/server/tests/test_events.py — 两项现有测试。
- F:/aoying-monitor/deploy/aoying-https.conf — 当前404入口。
- F:/aoying-monitor/docs/SOURCES.md — 平台输入不足；不阻塞合成Web验证。
</canonical_refs>

<specifics>
仓位监控核心是“同一消息文本编辑产生变化”。阶段1数据模型用合成编辑版本证明原文与事件追溯，不在阶段1实现真实仓位解析算法。
手机：K50 Android14 OS2.0.10.0.ULNCNXM，仅用于响应式网页浏览参考，不做APK。
</specifics>

<deferred>
Telegram授权/采集/差异识别Phase2；X Phase3；Fomo/OKX Phase4；完整长时运行Phase5；设备回执/响铃App、AI后续里程碑。
</deferred>
