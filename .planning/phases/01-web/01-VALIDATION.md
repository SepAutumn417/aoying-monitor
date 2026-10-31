---
phase: 1
slug: web
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-30
---
# Phase 1 — Validation Strategy

当前为规划合同，所有新增检查待开发后运行；不因研究或计划检查通过而标记业务验收通过。

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | pytest/HTTPX＋Playwright，执行时锁定版本 |
| Config | 拟建 server/pyproject.toml 与 web/playwright.config.ts |
| Quick | python -m pytest server/tests -q |
| Frontend | npm --prefix web run build |
| Browser | npm --prefix web run test:e2e |
| Existing baseline | PowerShell: $env:PYTHONPATH='server'; python -m unittest discover -s server/tests -v （2项原型，执行前再跑） |

## Sampling Rate
每任务运行对应测试；每计划完成跑后端全套和前端构建；涉及页面运行浏览器E2E。首次真实浏览器闭环须在扩展任务前通过。开发结束跑完整套件，部署后单独TLS/权限/重启/恢复检查。
计划内预估快测反馈≤60秒，完整浏览器套件≤5分钟仅为预算，实施后记录实测，超时查明原因，不绕过失败。

## Requirement / Threat Verification Map

| Requirement | Threat | Secure Behavior | Proposed command | File Exists | Status |
|---|---|---|---|---|---|
| AUTH-01 | T01/T02/T03 | 匿名401；登录统一错误与限频；Cookie标志；Origin/CSRF拒绝；退出/到期旧cookie失效 | python -m pytest server/tests/test_auth.py -q | W0待建 | pending |
| DATA-01 | T05 | 同来源/消息/版本重放幂等；A→B→A；多事件原子写；并发唯一；未知schema拒绝；备份恢复 | python -m pytest server/tests/test_storage.py -q | W0待建 | pending |
| WEB-01 | T01/T04 | 稳定before/after分页不丢中间数据；详情关联正确；原文纯文本；空态/错误/旧数据/401清屏 | python -m pytest server/tests/test_api.py -q + npm --prefix web run test:e2e | W0待建 | pending |
| OPS-01 | T06/T07 | 非root、回环监听、TLS验证、密钥脱敏、证书续期与回滚演练 | python -m pytest server/tests/test_config.py -q + deploy smoke | W0待建 | pending |

## Per-Task Verification Map

下列命令为未来实现合同，规划期不运行尚不存在的检查；01-01首任务建立相关基础设施。任何组合命令须逐项检查退出码，前一步失败立即停止，不能用分号后的成功掩盖失败。

| Task | Plan/Wave | Requirements | Threat | Automated command | Status |
|---|---|---|---|---|---|
| 01-01-01 | 01 / 1 | AUTH-01 WEB-01 | T01/T02/T03/T06 | python -m pytest server/tests/test_auth.py -q; npm --prefix web run build; npm --prefix web run test:e2e -- auth-flow.spec.ts | pending |
| 01-01-02 | 01 / 1 | AUTH-01 WEB-01 | T01/T02/T03 | python -m pytest server/tests/test_auth.py -q; npm --prefix web run test:e2e -- auth-flow.spec.ts | pending |
| 01-02-01 | 02 / 2 | DATA-01 WEB-01 AUTH-01 | T01/T04/T05 | python -m pytest server/tests/test_auth.py server/tests/test_storage.py server/tests/test_api.py -q; npm --prefix web run build; npm --prefix web run test:e2e -- event-flow.spec.ts | pending |
| 01-02-02 | 02 / 2 | DATA-01 WEB-01 AUTH-01 | T01/T03/T05 | python -m pytest server/tests -q; npm --prefix web run test:e2e -- auth-flow.spec.ts event-flow.spec.ts | pending |
| 01-03-01 | 03 / 3 | DATA-01 WEB-01 AUTH-01 | T04/T05/T06 | python -m pytest server/tests/test_storage.py server/tests/test_api.py -q; npm --prefix web run test:e2e -- history-flow.spec.ts | pending |
| 01-03-02 | 03 / 3 | DATA-01 WEB-01 AUTH-01 | T01/T04/T05 | python -m pytest server/tests/test_api.py -q; npm --prefix web run test:e2e -- history-flow.spec.ts; npm --prefix web run build | pending |
| 01-04-01 | 04 / 4 | AUTH-01 WEB-01 OPS-01 | T01/T04/T06 | python -m pytest server/tests/test_api.py -q; npm --prefix web run test:e2e -- state-flow.spec.ts; npm --prefix web run build | pending |
| 01-04-02 | 04 / 4 | WEB-01 AUTH-01 | T01/T04 | npm --prefix web run test:e2e -- accessibility.spec.ts state-flow.spec.ts; npm --prefix web run build | pending |
| 01-05-01 | 05 / 5 | AUTH-01 DATA-01 WEB-01 OPS-01 | T01–T07 | python -m pytest server/tests/test_config.py -q; npm --prefix web run build; npm --prefix web run test:e2e; bash deploy/verify.sh --base-url https://64.176.50.42 | pending |
| 01-05-02 | 05 / 5 | DATA-01 OPS-01 | T05/T06/T07 | python -m pytest server/tests/test_storage.py server/tests/test_config.py -q; bash deploy/verify.sh --base-url https://64.176.50.42 --restart-check --restore-check --renewal-dry-run | pending |
| 01-05-03 | 05 / 5 | AUTH-01 WEB-01 OPS-01 | T01/T04 | npm --prefix web run test:e2e; python -m pytest server/tests -q; 用户四页面/K50真实软键盘证据 | pending human |

## Wave 0 Requirements
- 01-01创建Python/前端可复现依赖与测试配置、认证fixtures和Playwright真实应用启动。
- 01-02再创建storage/API与事件浏览器fixture，不能在01-01引用它们。
- 01-03创建history-flow；01-04创建state-flow与accessibility；01-05首次创建test_config及部署smoke。
- 原型test_events.py两项回归保留。不存在的测试/脚本不得标记通过。

## Manual-Only / Backstop Verifications
- WEB-01：360/768/1440截图、200%缩放、长中文/长URL、键盘焦点和48px触摸目标，归01-04-02。
- AUTH-01/WEB-01：浏览器真实断网/401/500、保留旧记录与失效清屏，归01-04。
- WEB-01：K50真实软键盘不遮挡提交，归01-05-03人验，缺证据保持待验。
- OPS-01：公开HTTPS/TLS、非root、静态/DB/env权限、续期、恢复/回滚，归01-05实际执行证据。

## Validation Sign-Off
规划已由独立checker复审，无BLOCKER/WARNING；本文件仍为draft，测试、截图、部署和用户验收均未执行。
- [ ] Wave0真实建立测试基础设施
- [ ] 各任务自动检查执行并留证据
- [ ] UI backstop真实证据齐备
- [ ] 部署/恢复与用户验收齐备
**Approval:** pending user phase-plan confirmation. nyquist_compliant与wave_0_complete不因规划通过而宣称实现通过。
