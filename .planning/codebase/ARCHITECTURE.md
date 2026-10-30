# 当前架构

EventLog直接操作单个SQLite连接，append事务生成每设备序号并按source_key去重，replay分页恢复。同步对象不是可直接共享的异步HTTP服务；认证、回执和连接层均不存在。目标架构与当前能力必须区分。证据：server/aoying/events.py。
