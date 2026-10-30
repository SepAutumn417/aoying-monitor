# 测试现状

2026-10-30复跑：PYTHONPATH=server python -m unittest discover -s server/tests -v，2项通过。覆盖：重复事件、关闭后重开补收、设备隔离、无效游标、超大正文不消耗序号。未覆盖并发写、认证、WSS、设备回执及Android真机。不能称为端到端测试。
