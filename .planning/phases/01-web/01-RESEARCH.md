# Phase 1: 服务端与 Web 可用基础 — Research

**Researched:** 2026-10-30。**Confidence:** MEDIUM：官方文档与本地原型已核对；推荐组合尚未安装、运行或兼容性实测。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- [D01] v1先服务端和Web，手机App及AI后置；不包含自动交易、Gotify或第三方通知SaaS。
- [D02] 用户个人私有使用，需要登录退出、受保护接口和清晰错误，不做多租户注册系统。
- [D03] 原文及编辑版本、标准事件持久化去重，重启恢复；对后续动态仓位比较保留依据，不把行情刷新当操作。
- [D04] Web具备登录、时间线、详情、来源/系统状态；合成数据标注、未接入来源标注未接入，不能显示“健康”或“空仓”。
- [D05] HTTPS正常校验、非root、凭证不入Git/日志，在真实数据接入前落实；自建不等于端到端加密。
- [D06] 每阶段方案确认后执行。新仓库独立、保留原型证据，旧项目只读参考，不复制旧session/凭证。
- [D07] 失败、无数据、未接入、加载中分别表达；Web不保证锁屏后台叫醒。

### Agent Discretion — proposed, not user-locked
技术栈/数据库迁移、会话实现、目录、API、分页与更新策略由研究推荐，明确理由与替换成本。
界面建议中文、中性色、桌面优先兼容手机浏览器、无装饰行情图；具体设计随详细方案供用户确认。
若可用基础只需轮询，则不为未来App提前开发设备WSS；但统一事件接口须可扩展。

### Deferred Ideas
Telegram授权/采集/差异识别Phase2；X Phase3；Fomo/OKX Phase4；完整长时运行Phase5；设备回执/响铃App、AI后续里程碑。
</user_constraints>

## Project Constraints (from AGENTS.md)

[VERIFIED: F:/aoying-monitor/AGENTS.md] 简体中文；独立新目录及服务；不复制旧凭证/session；密码、令牌、数据库、日志与备份不入Git；不自动交易，不向外部模型披露原文。GSD文件为正式范围，docs/MASTER-PLAN.md仅历史参考。阶段方案确认后执行，允许研究/规划/验证代理，执行阶段串行。本轮仅规划，不安装、开发或部署。

<phase_requirements>
## Phase Requirements

| ID | 目标 | Research Support |
|---|---|---|
| AUTH-01 | 登录退出、安全会话和权限隔离 | 同源不透明Cookie会话、DB撤销、CSRF与失败限频 |
| DATA-01 | 原文/版本/标准事件持久化去重、重启恢复 | 来源中心模型、原子版本与事件提交、唯一索引、迁移和备份 |
| WEB-01 | 登录、时间线/详情、状态以及明确空态/错误 | REST合同、5秒增量轮询、未接入状态与纯文本显示 |
| OPS-01 | HTTPS、非root、凭证隔离和日志脱敏 | 独立systemd、回环端口、同源nginx、证书续期与发布回滚 |
</phase_requirements>

## Summary

[CITED: https://fastapi.tiangolo.com/advanced/response-cookies/] [CITED: https://react.dev/learn/build-a-react-app-from-scratch] [CITED: https://www.sqlite.org/wal.html] 推荐 FastAPI + Python sqlite3 + React/TypeScript/Vite，构建后的静态资源与API同源，由nginx提供HTTPS。React官方默认优先框架，但也记录Vite从零构建路径；本项目不需SSR/SEO且已有Python后端，因此选择客户端SPA是本阶段设计判断，而非官方唯一推荐。

[VERIFIED: server/aoying/events.py] 当前只有per-device事件日志，不能直接变成Web产品模型。保留现有两项测试，新增来源、原文、编辑版本、标准事件、会话表；不把手机device或synthetic=true硬编码带入正式采集模型。

**Primary recommendation:** [ASSUMED: project design proposal] 第一条端到端切片是“本地CLI写入合成原文/事件 → 登录Web → 查到时间线及详情 → 退出后不能读取”，随后扩展编辑版本、增量刷新、来源状态和发布验收。全部待用户阶段方案批准，不在研究阶段实现。

## Architectural Responsibility Map

| 能力 | Primary Tier | Secondary Tier | 边界 |
|---|---|---|---|
| 登录认证/会话撤销/CSRF | API | SQLite | 浏览器不能决定权限 |
| 原文版本及事件去重 | SQLite事务 | API/CLI | 内存与页面不能作为唯一记录 |
| 时间线筛选、详情与状态 | Browser | API | 服务端分页/鉴权，前端不下载全库 |
| HTTPS/静态文件/请求限制 | nginx | systemd | 不公开开发服务器或数据库 |
| 来源健康语义 | API/未来采集器 | Browser | Phase1真实平台均not_configured |

此职责表为设计建议。[ASSUMED: architecture decision proposed for approval]

## Standard Stack

| 组件 | 本次注册表观察版本 | 用途与依据 |
|---|---|---|
| Python/sqlite3 | 本机3.13.14 / SQLite3.50.4 | 已有原型；[VERIFIED: local python probe] |
| FastAPI | 0.162.0 | Cookie、路由与请求验证；[CITED: https://fastapi.tiangolo.com/advanced/response-cookies/] |
| Uvicorn | 0.54.0 | 单worker ASGI服务；[CITED: https://www.uvicorn.org/settings/] |
| Pydantic | 2.14.2 | 入参与输出schema；[CITED: https://docs.pydantic.dev/latest/] |
| argon2-cffi | 25.1.0 | PasswordHasher而非自写密码算法；[CITED: https://argon2-cffi.readthedocs.io/en/stable/] |
| React/react-dom | 19.3.1 / 19.3.1 | 中文交互SPA；[CITED: https://react.dev/learn/build-a-react-app-from-scratch] |
| Vite / TypeScript / plugin-react | 8.3.5 / 7.0.2 / 6.1.2 | 本地构建，生产只发静态资源；[CITED: https://vite.dev/guide/] [CITED: https://www.typescriptlang.org/download/] |
| pytest / HTTPX | 9.2.0 / 0.28.1 | 单元及ASGI接口测试；[CITED: https://docs.pytest.org/en/stable/getting-started.html] [CITED: https://www.python-httpx.org/] |
| @playwright/test | 1.64.1 | 真实登录/页面/退出浏览器验证；[CITED: https://playwright.dev/docs/intro] |

[VERIFIED: PyPI JSON and npm view probes] 以上是规划时观察的候选版本，不是兼容性锁定结果；npm time.modified不是首发时间。实施第一任务复核目标Python/Node支持、peerDependencies、官方安全公告，再固定精确版本和锁文件。不得用latest浮动生产发布；不在本轮安装。新增测试类型包同样走来源核对。前端运行不调用CDN、外部字体、统计或SaaS。[ASSUMED: release policy proposal]

## Package Legitimacy Audit

[VERIFIED: gsd-tools package-legitimacy check output, 2026-10-30] 两个生态均实际运行检查，无SLOP。结果如下，不能把SUS自动翻译成“恶意软件”。官方项目文档、源码仓库及注册表版本已交叉定位；安装仍需常规版本/来源复核。

| Packages | Registry | Seam Verdict | 实际信号 | Disposition |
|---|---|---|---|---|
| fastapi, pydantic, pytest | PyPI | SUS | latest too-new，下载量字段缺失；官方repo存在 | 保留，执行前版本/来源审查 |
| uvicorn, httpx | PyPI | SUS | 下载量字段缺失，官方repo存在 | 保留，执行前版本/来源审查 |
| argon2-cffi | PyPI | SUS | 下载量/repo字段缺失；官方文档另给GitHub链接 | 保留并核对发行元数据 |
| react, react-dom, vite, @vitejs/plugin-react, @playwright/test | npm | SUS | too-new；官方repo、周下载量存在；postinstall字段为空 | 保留，锁定审查后的版本 |
| typescript | npm | OK | 官方repo、周下载量存在，无postinstall | 保留 |

“未知下载量”不是零下载量，最新版本太新不代表包首次发布。研究不新增无依据的用户审批；阶段方案批准后，安装前由执行者检查来源和固定版本，若出现真实异常再报告。[ASSUMED: review handling proposal]

## Architecture Patterns

### 数据流

```text
本地管理CLI/后续来源适配器
       ↓ 校验、稳定来源键
原文＋不可变编辑版本＋标准事件（一个SQLite事务）
       ↓
同源受保护REST ← 会话摘要/到期/撤销检查
       ↓
Web登录 → 时间线分页 → 原文/版本详情 → 来源状态
```

以下模型/API/参数均为建议合同，供规划锁定，不是现有实现。[ASSUMED: concrete design proposal]

### 来源中心模型与幂等

- `sources(id,platform,external_ref,label,state,last_event_at,last_checked_at,last_error_code)`：Phase1初始化Telegram四话题、X、Fomo、OKX的占位来源，真实平台均`not_configured`。另有明确synthetic测试来源。
- `raw_messages(id,source_id,external_message_id,first_seen_at)`，唯一`(source_id,external_message_id)`。
- `raw_revisions(id,message_id,version_key,body,body_sha256,source_time,observed_at)`，唯一`(message_id,version_key)`；没有可靠外部版本号时适配器给确定性的观测版本键，不能单靠正文hash丢掉A→B→A的版本次序。
- `events(seq INTEGER PRIMARY KEY,event_id,revision_id,event_key,kind,title,body,synthetic,source_time,created_at)`，`event_id`、`event_key`唯一，外键版本；一条版本未来可生成多笔事件，event_key需包含操作定位/解析版本而非仅revision_id。
- `schema_migrations(version,applied_at)`、`users(id,username,password_hash)`、`sessions(token_hash,user_id,csrf_hash,created_at,last_seen_at,expires_at,revoked_at)`、持久化登录失败计数。密码hash不是明文凭证，DB需要受限权限；原始密码只在本地初始化输入中使用。
- 合成fixture必须至少包含同一消息两个版本、重复重放、恶意HTML文本、未接入来源与受控错误，全部标明合成。CLI和未来采集器共享写服务，不用公开POST事件接口；本阶段不实现真实仓位解析。

### SQLite并发、迁移与旧原型

[CITED: https://www.sqlite.org/wal.html] WAL支持读写并行但仍单写者，`SQLITE_BUSY`仍可能发生。[CITED: https://docs.python.org/3/library/sqlite3.html] Python连接默认有线程检查、提供参数化SQL和在线backup接口。推荐每事务独立连接并在拥有该连接的同一同步调用内完成，FastAPI同步路由/服务在线程池执行；不跨线程共享现有EventLog连接。设置busy_timeout、foreign_keys、显式BEGIN IMMEDIATE，短事务，单worker，有限重试且失败可见；新增CLI并发写回归。[ASSUMED: implementation recommendation]

- 新生产数据库使用独立路径，例如`/var/lib/aoying-monitor/aoying.db`；不直接覆盖per-device原型DB。显式初始化迁移，启动发现更高schema版本时拒绝运行，禁止静默DROP/重建。
- 若发现原型库：先备份，识别旧schema；默认保留原型文件，不自动导入。若需导入，仅显式管理命令映射到synthetic legacy来源，保留原device与source_key作元数据，并验证原/版本/事件数量及重复导入幂等。
- 迁移从空库、已知v0 fixture及更高版本拒绝三路验证；backup API复制后完整性检查。在另一路径恢复后做记录核对；生产回滚优先恢复旧发布与兼容DB备份，不对新schema直接运行旧程序。
- 运行态盘点：现有生产DB、live配置、账号/环境/构建产物本轮未重新连接服务器验证，不能宣称不存在；实施前只读盘点并准备恢复。库版本和WAL官方当期修复说明需复核，不能以Python版本间接假设SQLite安全修复已覆盖。

### 会话与认证

[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html] 推荐不透明随机session cookie，服务端只存token SHA256，登录轮换、退出撤销；密码用Argon2id库。个人单账号由本地CLI创建，无注册/找回邮件/公网密码重置。

- Cookie `__Host-aoying_session`，`Secure; HttpOnly; SameSite=Strict; Path=/`，无Domain；本地开发优先HTTPS，若允许HTTP仅loopback显式开发配置，绝不可用于公网。[ASSUMED: cookie policy]
- 建议绝对会话12小时、空闲30分钟、登录失败按IP+用户名各5次/15分钟短暂限流，429给Retry-After；阈值为可配置建议，不冒充标准强制值。多请求last_seen按节流更新，避免轮询每次写DB。[ASSUMED: defaults for approval]
- POST登录要求`application/json`和精确Origin（含scheme/host/port）；已登录修改/退出除Origin检查还要求会话绑定CSRF token，用`X-CSRF-Token`，服务端校验；禁止宽泛CORS。缺失Origin的浏览器写操作拒绝，CLI不用这组cookie接口。[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html] [ASSUMED: exact policy]
- `GET /api/v1/auth/session`鉴权成功返回用户及CSRF token，未登录401；登录可返回相同结构；退出后旧cookie重放401。所有消息/来源/状态接口同一鉴权依赖，存在性检查不先于认证，避免对象枚举。

### API与分页刷新

| 方法/路径 | 合同 |
|---|---|
| POST `/api/v1/auth/login` | JSON username/password；200会话，401统一错误，429限流 |
| GET `/api/v1/auth/session` | 用户/CSRF token，Cache-Control:no-store |
| POST `/api/v1/auth/logout` | CSRF+Origin，撤销session并清cookie，204 |
| GET `/api/v1/events` | source_id/kind筛选；before_seq历史分页或after_seq增量二选一；limit默认50最大100；返回items,next_cursor,has_more,last_seq |
| GET `/api/v1/events/{event_id}` | 事件、来源、所属原文、版本列表；404不伪装空数据 |
| GET `/api/v1/sources` | 来源配置状态、最近核对/消息时间、脱敏错误；不返回session/密钥 |
| GET `/api/v1/status` | 已鉴权运行版本、DB可用性、server_time；无敏感路径 |
| GET `/health/live` | 无鉴权固定存活布尔，不泄漏版本/磁盘/来源；DB详细状态保持鉴权 |

参数用Pydantic限制；before/after互斥，非法游标422（客户端可显示参数错误），失效会话401。时间UTC存储，浏览器显示明确UTC+8时间并可见原始源时间；不信任客户端生成的排序。[ASSUMED: API contract]

页面可见时每5秒串行轮询after_seq，超时/失败保留最后成功内容并标记“更新失败/最后成功时间”，不清成空页；不可并发叠加轮询。分页期间保持当前视图，新事件提示“有新信息”由用户刷新；恢复网络立即补查，不能只取最后一页而漏中间事件。页面隐藏时暂停或降频，恢复立即同步。[ASSUMED: UX/network policy]

选择轮询而非SSE/WSS：Phase1读为主且单用户，先减少连接生命周期与代理心跳复杂性；接口与seq可用于未来SSE/App。5秒不是严格实时承诺，实际观察延迟另测。若后续实测需求要求更低延迟，再改变传输层而不重写事件模型。[ASSUMED: design tradeoff]

### 原文展示与来源状态

[CITED: https://react.dev/reference/react-dom/components/common] 不信任采集原文，React文本节点显示，禁止`dangerouslySetInnerHTML`；第一阶段不渲染任意Markdown/远程媒体/HTML。外链仅http/https显式允许、`noopener noreferrer`，不自动访问原文包含的地址。

来源state至少`not_configured`,`disabled`,`starting`,`healthy`,`degraded`,`error`；Phase1真实源固定not_configured，只有合成来源可显示test数据。HTTP失败不是来源error的替代；无记录不等于来源未接入，也不等于空仓。此状态机是设计建议。[ASSUMED: status contract]

## Don't Hand-Roll

| 问题 | 使用方式 | 避免 |
|---|---|---|
| 密码保护 | argon2-cffi PasswordHasher | 自写hash或明文密码 |
| 参数化SQL/一致备份 | Python sqlite3参数绑定及backup | 字符串SQL、在线只复制主db漏WAL |
| 输入输出schema | Pydantic | 接受任意对象后手工拼响应 |
| XSS安全边界 | React文本节点、受限链接 | 直接注入原文HTML |
| 网络超时/测试 | 浏览器fetch+AbortController、HTTPX/Playwright | 无界等待、仅mock证明页面可用 |

以上库能力见前述官方文档；具体组合是设计建议。[CITED: https://docs.python.org/3/library/sqlite3.html] [CITED: https://www.python-httpx.org/] [ASSUMED: project integration]

## Common Pitfalls

1. [VERIFIED: events.py] 把`device`当来源、所有事件synthetic且5分钟过期，会污染Web业务模型；新增模型与明确适配，旧测试作为回归不直接充当新接口测试。
2. [CITED: OWASP CSRF source above] SameSite不是完整CSRF方案；登录和退出也要检查来源与请求类型，退出撤销DB记录而非只清cookie。
3. [CITED: SQLite WAL source above] WAL不保证无锁错误；并发测试必须含CLI和HTTP写入，不只单线程append。
4. [ASSUMED: design risk] 未接入来源显示绿色健康、请求失败显示暂无数据，会重现旧系统静默故障；各状态有fixture和浏览器验收。
5. [CITED: https://letsencrypt.org/2026/03/11/shorter-certs-certbot/] IP证书是六天短证，签发不等于续期已自动完成；保留定时任务与重载hook，发布时验证证书链、到期和模拟续期。

## Code Examples

官方能力示例（不是本轮实现）：[CITED: https://fastapi.tiangolo.com/advanced/response-cookies/]

```python
response.set_cookie(key="__Host-aoying_session", value=raw_session_token,
                    secure=True, httponly=True, samesite="strict", path="/")
```

[CITED: https://docs.python.org/3/library/sqlite3.html] `conn.execute("SELECT ... WHERE source_id=?", (source_id,))`；`source.backup(destination)`。应用还须在事务中保证版本/事件原子写入，不能把上述片段当完整安全实现。[ASSUMED: app-specific requirement]

## Environment Availability

| 环境 | Available | Evidence / Fallback |
|---|---|---|
| Windows Python3.13.14 / SQLite3.50.4 | 已读探测 | 未安装新依赖；实施时隔离venv |
| Node24.15.0 / npm11.12.1 | 已读探测 | 提交lock，用npm ci；不在服务器运行Vite dev |
| ctx7 / Context7 MCP | 未发现 | 使用官方网页原文；未自动安装工具 |
| FastAPI/pytest等当前全局环境 | 未作为构建合同 | 实施时精确锁定并跑全套，不依赖全局偶然存在 |
| 新React项目/测试浏览器 | 未建/未安装 | Wave0建立后用Playwright验证；浏览器安装需要正常来源检查 |
| 服务器Python/磁盘/TLS运行状态 | 本轮未读探测 | 发布前重新只读核对，不引用历史状态作当前证据 |

[VERIFIED: local environment commands and repository inspection] 不做依赖安装或服务器变更。

## Validation Architecture

### Test Framework
建议pytest+HTTPX集成现有unittest，Playwright验证实际网页；版本见候选表但未安装。[CITED: pytest/HTTPX/Playwright sources above] [ASSUMED: phase test design]

| Req | 行为/威胁 | 自动验证 | 当前状态 |
|---|---|---|---|
| AUTH-01 | cookie标志、401、过期/撤销、CSRF、限频、无明文会话 | `python -m pytest server/tests/test_auth.py -q` | Wave0待建 |
| DATA-01 | 空库/升级/未知schema、重复版本、A→B→A、并发唯一、回滚/重启恢复 | `python -m pytest server/tests/test_storage.py -q` | 待建；原型2测已存在 |
| WEB-01 | 分页/增量/详情关联/状态语义/失败保留数据 | `python -m pytest server/tests/test_api.py -q`，`npm --prefix web run test:e2e` | 待建 |
| OPS-01 | 非root/回环绑定/TLS/日志/配置无秘密 | `python -m pytest server/tests/test_config.py -q`，部署后HTTPS smoke | 待建；生产配置需人工核对 |

Quick：`python -m pytest server/tests -q`；Full：上述加`npm --prefix web run build`和`npm --prefix web run test:e2e`。Wave0建立包配置、pytest路径、临时DBfixture、web/package.json和Playwright配置；不会在缺文件时声称测试通过。原型回归：`PYTHONPATH=server python -m unittest discover -s server/tests -v`（PowerShell用环境变量赋值）。[ASSUMED: commands to be implemented]

每任务跑相关快测、每计划跑后端全套和前端构建，UI计划结束跑浏览器E2E；部署前跑全套并留截图/日志脱敏摘要。浏览器应覆盖登录→真实API中的合成事件→详情→编辑版本→状态→退出/旧cookie失效，恶意HTML不执行，断网/401/500与空列表不同，1366px/390px无关键遮挡。实际公网TLS与续期、权限和重启恢复保留人工smoke证据。[ASSUMED: sampling and evidence contract]

## Security Domain

[CITED: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html] [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html] 参考鉴权、会话、访问控制、输入输出与传输保护类别；未声称通过任何完整ASVS认证，编号随采用的ASVS版本复核。

| Threat | 防护 | 可观察验证 |
|---|---|---|
| T01 未授权读取/对象枚举 | 全部数据API统一会话依赖 | 所有路由匿名401，登录后对象404 |
| T02 CSRF/登录CSRF | 精确Origin、JSON、会话CSRF token | 外站/缺token拒绝，不产生session或退出副作用 |
| T03 密码猜测/会话窃取 | Argon2id、失败限频、随机token仅存摘要、过期撤销 | 统一401、阈值429、旧cookie拒绝、DB无明文token |
| T04 采集文本XSS/恶意URL | 文本呈现、链接协议限制、基础CSP | script标签仅文本，无弹窗/外站请求 |
| T05 SQL注入/并发重复/半写 | 参数化、唯一索引、原子事务 | 注入字串不改表；并发一次事件；失败无孤儿版本 |
| T06 日志/备份/配置泄密 | 无请求正文/cookie日志，权限0600、非root、无源码凭证 | 构造秘密后检查日志/仓库，不读取敏感值到报告 |
| T07 证书失效/错误代理信任 | TLS验证、续期hook、仅回环后端、限制可信proxy | 公网正常验证，错误host/证书失败，后端端口不可外连 |

上述为可实施威胁模型建议，不是已完成控制。[ASSUMED: threat model]

## Planning Shape / Tracer First

建议3–4个串行执行计划，每个都包含完整可验证纵向切片：
1. 安全登录＋一个CLI合成事件写入＋Web列表/详情＋退出（含最小生产质量存储/认证，不先写空壳UI）。
2. 原文版本/去重/分页轮询＋完整状态与错误界面，扩展恶意文本和编辑fixture。
3. 前端响应式与安全回归、独立非root发布、TLS/续期/重启/恢复smoke及用户验收。
如果单计划过大可将发布独立，但不能做“所有DB→所有API→所有UI”的纯水平分期。每份计划列具体文件、命令、可观测标准、威胁引用和失败回滚。[ASSUMED: decomposition recommendation]

## Assumptions Log / Open Questions

- 技术栈组合、模型/API、5秒刷新、会话/限频默认值为本阶段方案建议，用户确认方案后才锁定；不假称此前用户指定。
- 所有包观察版本尚未兼容性测试，实施前解决；seam SUS原因已透明列出，不用其制造无依据审批。
- 正式来源账号、授权与仓位样本缺失不阻塞合成Web阶段，但不得用合成数据验收真实监控。
- 数据保留期与完整加密策略后续确定；Phase1不自动删除原始消息且数据路径受限，不能无限增长不观察。
- 独立整机探活属于Phase5，Phase1状态页无法报告整台服务器已停机给离线用户；不要扩大完成声明。

## Sources and Provenance

官方来源均在对应段落给出。实际运行GSD研究路由后指向Context7，但环境无该MCP/CLI，按官方文档回退；`classify-confidence --provider webfetch --verified`返回LOW，`context7 --verified`返回MEDIUM，本报告不伪称使用Context7或以Web抓取作HIGH。官方说明标CITED、本地/注册表观察标VERIFIED，设计建议标ASSUMED，不将建议当既定事实。研究缓存仅作摘要，不把缓存当兼容性验证。

有效期建议：包版本和工具链在执行前重新核实；安全和数据模型结论在范围/访问方式变更时复审。[ASSUMED: maintenance policy]


## 规划修订决策：CSRF恢复合同（待实现）
本节取代前文sessions.csrf_hash及返回原始随机CSRF的推荐，保留原研究来源作为研究证据。sessions只存session token_hash及期限/撤销字段；CSRF使用base64url(HMAC-SHA256(AOYING_CSRF_SECRET, "csrf-v1:"+原session token))确定性派生，secret至少32随机字节、只在受限服务环境；login/session均返回同一派生值，JS永不取得原session。服务器常量时间校验，reload/多标签可恢复；另一标签退出后logout/activity均因session撤销拒绝。secret轮换同时撤销全部sessions。计划01与认证回归负责验证，非已实现结果。
