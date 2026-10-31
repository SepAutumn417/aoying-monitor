# Phase 1 — Existing Pattern Map

**Checked:** 2026-10-30。仅本地代码盘点；没有前端实现可类比，不借旧项目代码充当新项目规范。

## 已有类比与边界

| 新职责 | 最近现有类比 | 可保留模式 | 不可照搬 |
|---|---|---|---|
| 标准事件持久化服务 | `server/aoying/events.py` EventLog.append | BEGIN IMMEDIATE、参数绑定、唯一约束、异常rollback | per-device键、固定synthetic/test、跨请求共享连接 |
| 持久化分页读取 | EventLog.replay | 序号游标、100条上限、未知游标报错 | device作为Web来源、同步连接跨线程 |
| 迁移/重启回归 | `server/tests/test_events.py` | 临时DB、关闭重开、重复key、非法payload | 只有两个测试不能证明HTTP/认证并发正确 |
| HTTPS入口 | `deploy/aoying-https.conf` | TLS1.2/1.3、证书路径、无查询日志 | 当前404不是后端已部署 |
| 续期 | `deploy/aoying-cert-renew.*`、reload脚本 | 定时检查与nginx校验重载 | 历史模拟通过不当作当前实时状态 |
| Web/API/认证 | 无 | 新建小而清晰模块；合同以01-RESEARCH与UI-SPEC为准 | 不复制旧workbench或会话配置 |

## 具体代码证据

```python
# server/aoying/events.py
self.db.execute("BEGIN IMMEDIATE")
row = self.db.execute(
    "SELECT payload FROM events WHERE device=? AND source_key=?",
    (device, source_key),
).fetchone()
```

保留参数化和事务意图，转换为来源/原文版本/事件写服务，且在同一线程创建、使用、关闭连接。新模型必须验证A→B→A版本、同版本重放与并发唯一性；不要只改列名或删除旧测试。

## 迁移责任

当前测试原型文件保留为历史兼容回归；新生产DB独立创建，存在原型库时只做显式备份/可选导入，不自动清空。实现前查明实际DB与服务配置，不把仓库没有文件当成服务器无数据。
