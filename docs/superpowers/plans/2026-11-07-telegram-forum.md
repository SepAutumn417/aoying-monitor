# Telegram 四区采集闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仅接入书友会四区，可靠保存话题和编辑，按重点发言查询并完成真实接入验收。

**Architecture:** 保留 TelegramDialog 和消息主键身份，新增 TelegramTopic 与可空消息 topic_id。原文采集与重点筛选分离；解析仓位和手机通知均不在本增量。

**Tech Stack:** FastAPI、SQLAlchemy async、SQLite/Postgres、Telethon、React、Vitest。

---

用户已批准修订设计及第一步实施。使用当前工作区，保留未提交 config.py 路径修正及私有 aoying.db，不复制 session 到新 worktree，不将数据库或凭证加入 Git。

## 文件边界与接口契约
后端负责 backend/app/telegram_models.py、telegram_store.py、telegram_collector.py、api/telegram.py、db.py，以及新的小型话题辅助/升级模块和 backend/tests/test_telegram_forum.py。前端负责 web/src/lib/api.ts、features/timeline/TimelinePage.tsx、features/sources/SourcesPage.tsx 与 Web 测试。Lead 负责设计文档、运行配置保护和真实联调。
- GET /api/telegram/topics?chat_id=-1002568478710 返回数组；每项 id, chat_id, topic_id, title, enabled, last_message_id, last_synced_at, messages, last_error。
- 消息返回追加 sender_id: number|null、topic_id: number|null、topic_title: string、sender_role: owner|signal_bot|assistant|member；role 根据目标群与固定 sender_id 识别。
- GET /api/telegram/messages 追加 topic_id 和 focus=all|important|owner；important 包含该目标群交易区可信 bot、禁言区本人、聊天区本人；all 保留其他原文。未传 focus 保持兼容。非法 focus 返回 400。
- owner=7460753506，signal_bot=8797733775，assistant=8907156644；General=1，禁言=748，交易=926111，通知=1006930；只作用于目标 chat_id。
- UI 默认 focus=important，提供 all/owner 切换及四区筛选，重点筛选与分区筛选同时生效，页面明确显示筛选状态。

### Task 1: 话题归属和无损升级
- [ ] 添加失败测试并运行 `python -m pytest tests/test_telegram_forum.py -q`。覆盖：
```python
assert topic_id_of(SimpleNamespace(reply_to=None, action=None)) == 1
assert topic_id_of(SimpleNamespace(reply_to=SimpleNamespace(forum_topic=True, reply_to_top_id=748, reply_to_msg_id=999), action=None)) == 748
assert topic_id_of(SimpleNamespace(reply_to=SimpleNamespace(forum_topic=False, reply_to_top_id=1756158, reply_to_msg_id=1756161), action=None)) == 1
```
- [ ] 添加 TelegramTopic 表和消息 topic_id，首次建表后显式检测旧消息表缺列再 ALTER，升级可重复，旧数据不猜测归属；SQLite 旧库升级测试同时验证保留行。
- [ ] normalize 写入 topic_id，upsert 保留身份与修订，覆盖空文本编辑和媒体移除，原文不因推断分类改变。
- [ ] 运行新增测试及原 test_telegram.py，观察真实 PASS。

### Task 2: 每区同步及编辑补洞
- [ ] FakeClient 测试先失败：每区独立首次200条、General不把普通reply根当topic、独立游标、失败不前移、重复回补不重复、同message_id编辑被重读、未知topic不采、其他群不采。
- [ ] 拆出话题常量和纯归属函数，保持 collector 只负责 IO 与状态。闭合话题仍采集。
- [ ] 三个非 General 话题用 reply_to 线程历史；General 使用群历史并过滤，扫描期间未找到200条不得假装填满；用安全分页和可见同步状态处理网络/FloodWait，单区失败不中止其他区。
- [ ] 增量按各区 min_id 追赶，另重读最近窗口与活跃快照以发现离线编辑，保持去重与历史版本。游标只在成功持久化后前移。
- [ ] 执行回归，记录失败修复与通过证据。

### Task 3: API 话题与固定身份筛选
- [ ] 先加 API 测试：鉴权、topics、focus重要消息排除群友与通知、owner按ID不按昵称、topic组合筛选、非法focus=400。
- [ ] 实现上述契约；topics无配置时返回空数组。原端点默认行为不变，测试和数据不跨账号混用。
- [ ] `python -m pytest -q` 和 `python -m ruff check app tests`。

### Task 4: Web 四区及重点发言
- [ ] 先扩充现有 fetch mock 和失败测试，重要/全部/本人切换传递参数，四区标签显示，群友不冒充本人，空态说明筛选。
- [ ] 更新 API TypeScript 接口与 topics 方法；使用现有 PageHeader、StatusChip、按钮样式，不重做视觉设计。
- [ ] 时间线显示话题、发送者角色、编辑历史；数据源页列四区回补状态，移除四个独立群的误导性说明。
- [ ] `node node_modules/vitest/vitest.mjs run`，`node node_modules/typescript/bin/tsc --noEmit`，`node node_modules/vite/bin/vite.js build`。

### Task 5: 真实接入与验收
- [ ] 检查 git diff，无凭证输出。将根 *.db 和 session 纳入忽略，绝不 git add -A。
- [ ] 停止所有短期 Telethon 探测脚本，再备份根数据库至忽略目录 data/backups，保留原 session；明确根目录启动以使 DATABASE_URL 仍指向原数据库。
- [ ] 仅启用书友会，登记四区，启动唯一后端进程；监听目标群，不导出无关会话。
- [ ] 逐区检查计数与同步时间，查询 message API 的topic和重点过滤；启动现有项目 Web（不是 DSH GUI），浏览器检查真实标签和筛选。
- [ ] 用原地重复 sync 检查去重；实时新消息/编辑未实际观察则明确待验证，不用回补冒充实时。记录结果至 docs/increments/I2.md，用户验收后再继续下一增量。
- [ ] 自查最终 diff、运行测试，只暂存本增量代码与文档，提交 conventional commit，不包含 aoying.db、.env 或 data。
