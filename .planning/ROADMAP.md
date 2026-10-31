# Roadmap: 熬鹰资本监控 v1.0（Web优先）

用户2026-10-30最新指令：先监控+Web，完成后再考虑App。以下路线图待确认，尚未执行任何阶段。

## Phases
- [ ] **Phase 1: 服务端与Web可用基础**
- [ ] **Phase 2: Telegram真实监控与仓位变化**
- [ ] **Phase 3: X发言监控**
- [ ] **Phase 4: Fomo/OKX与统一Web**
- [ ] **Phase 5: 长期运行与Web验收**

## Phase Details

### Phase 1: 服务端与Web可用基础
**Goal**: 建立安全登录、持久化事件与可查看的Web基础，不依赖安卓构建。
**Depends on**: Nothing
**Requirements**: [AUTH-01, DATA-01, WEB-01, OPS-01]
**Success Criteria**:
1. 登录退出与未授权访问测试通过；真实内容接入前安全基线就绪。
2. 测试事件能在Web时间线和详情查看，重启保留且不重复。
3. 监控状态、失败与无数据各有清晰显示；合成数据明确标注。
**Plans**: 5份，详细规划已复审，待用户确认后依次执行。
- [01-01：安全登录与空时间线](phases/01-web/01-01-PLAN.md)
- [01-02：测试事件保存与列表详情](phases/01-web/01-02-PLAN.md)
- [01-03：编辑版本、幂等与增量更新](phases/01-web/01-03-PLAN.md)
- [01-04：来源状态、错误恢复与界面验收](phases/01-web/01-04-PLAN.md)
- [01-05：独立部署、恢复与人工验收](phases/01-web/01-05-PLAN.md)
顺序依赖：01 → 02 → 03 → 04 → 05。用户审阅入口：[详细方案](phases/01-web/01-PLAN-OVERVIEW.md)。

### Phase 2: Telegram真实监控与仓位变化
**Goal**: 四话题采集和动态仓位差异在Web可用。
**Depends on**: Phase 1
**Requirements**: [TG-01, TG-02, TG-03, WEB-02]
**Success Criteria**:
1. 本人/助理稳定ID及四话题来源可核对，新授权会话独立。
2. 新开仓/加减仓/平仓与编辑前后依据可回看；价格浮盈不误报。
3. 断线重启与漏编辑核对有恢复证据，缺失快照不当空仓。
**Plans**: TBD，阶段详细方案经用户确认后执行。

### Phase 3: X发言监控
**Goal**: 公开可获取的本人发言进入Web时间线。
**Depends on**: Phase 2
**Requirements**: [X-01]
**Success Criteria**:
1. 本人账号、访问方式、预算和检测时效明确；回复/引用/转推范围确定。
2. 原文、源时间、链接可追溯，限频与回填不重复且故障可见。
**Plans**: TBD，阶段详细方案经用户确认后执行。

### Phase 4: Fomo/OKX与统一Web
**Goal**: 按实际权限接入交易变化并统一展示。
**Depends on**: Phase 3
**Requirements**: [FOMO-01, OKX-01, WEB-03]
**Success Criteria**:
1. 每个平台具体入口、可见字段、单位和延迟单独验证，不假设可读私人订单。
2. Web可按平台查看仓位/历史/动态，未知与冲突保留。
3. 跨平台证据充分才去重；任何不可获取范围需用户明确决策。
**Plans**: TBD，阶段详细方案经用户确认后执行。

### Phase 5: 长期运行与Web验收
**Goal**: 完成真实来源、Web与运维隐私验收，之后再规划App。
**Depends on**: Phase 4
**Requirements**: [OPS-02, PRIV-01, E2E-01]
**Success Criteria**:
1. 备份恢复、容量与来源/整机失联测试通过。
2. 访问控制、日志与数据隐私复核通过，基础安全不延后到本阶段。
3. 提交真实来源长时与Web端到端证据；Web不被宣称能可靠后台叫醒手机。
**Plans**: TBD，阶段详细方案经用户确认后执行。

## 外部依赖与调整
Telegram新登录与样本；X主页；Fomo具体网址与账号/地址；OKX公开入口及权限均需补齐。外部入口阻塞时，经用户确认可交换阶段3/4顺序，不能用虚构数据代替监控。

## 后续里程碑
v2：自有安卓App、设备认证/回执、后台连接、声音和补收；保留Android研究与协议草案，实施前复核。AI后续单独规划。

## Progress
| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. 服务端与Web可用基础 | 0/5 | Plan reviewed; awaiting user approval | - |
| 2. Telegram真实监控与仓位变化 | 0/TBD | Not started | - |
| 3. X发言监控 | 0/TBD | Not started | - |
| 4. Fomo/OKX与统一Web | 0/TBD | Not started | - |
| 5. 长期运行与Web验收 | 0/TBD | Not started | - |
