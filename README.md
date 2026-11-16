# 熬鹰资本 · 交易监控

**Telegram 原始信息监控**：同步指定群的四个话题、机器人持仓快照和消息修订，
在 Web / Android 查看原文，并对可信来源的新动作消息发出提醒。

> 当前产品范围（2026-11-16）：以 TG 原文及最新快照为准，**不从消息推导仓位、盈亏或持仓生命周期**。
> Web / Android 已解除派生账本加载和展示；采集链路不再自动写入 Signal / Position / PositionEvent。
> 提醒仅逐条提取原文动作，不代表真实交易或新建仓位。自动跟单继续暂停。
>
> [本次收口范围](docs/source-only-monitoring-plan.md)。旧[跟单方案](docs/superpowers/specs/2026-11-07-copy-trading-strategy.md)
> 与[待办池](docs/backlog.md)保留作历史参考，不是当前交付或实施承诺。历史账本数据及兼容 API 不删除。

## 结构

```
backend/    FastAPI 服务（Python 3.12+），/healthz 健康检查
web/        React + Vite + Tailwind 的 Web 控制台
app/        Flutter Android 客户端（TG 原文、提醒、原生后台监控）
docs/       设计、计划、增量说明、设计 token
```

## 本地开发

### 后端

```bash
cd backend
python -m pip install -e ".[dev]"   # 若本机 pip 受限，见下方「本机环境备注」
python -m pytest
uvicorn app.main:app --reload --port 8000
curl http://127.0.0.1:8000/healthz
```

配置从仓库根目录的 `.env` 读取（已由 `.env.example` 复制而来，不进 git）。
Telegram 的 `api_id` / `api_hash` 怎么申请、怎么登录一次生成 session 文件，
见 [docs/telegram-setup.md](docs/telegram-setup.md)。

### Web

```bash
cd web
npm install --ignore-scripts --no-audit --no-fund
npm test
npm run dev        # http://127.0.0.1:5173 ，/api 与 /healthz 会代理到 8000
npm run build
```

### Android

```bash
cd app
flutter test
flutter run --dart-define=API_BASE_URL=http://<你的局域网IP>:8000
```

模拟器用默认的 `http://10.0.2.2:8000` 即可（映射宿主机）。

## 本机环境备注（Windows）

- 工作目录含中文，Flutter 的着色器编译器（impellerc）无法处理这类路径，
  本地构建/测试请通过 ASCII 联接访问：`F:\aoying_ws`（指向本仓库）、`F:\aoying_flutter`（指向 SDK）。
- Flutter 工具需要 `FLUTTER_ROOT`、`FLUTTER_PREBUILT_ENGINE_VERSION`、`PUB_CACHE`、`APPDATA`、
  `LOCALAPPDATA`、`HOME`、`TMP`、`TEMP` 指向工作区内的 `.tools/` 子目录（详见 `docs/increments/I0.md`）。
- Vite/Vitest/Flutter 需要启动管道子进程，在受限沙箱下会报 `EPERM`/`拒绝访问`，需放宽沙箱执行。
- 本机 `pip install` 因临时目录权限失败时，用仓库脚本直接取 wheel 到 `backend/.pylib`：

  ```bash
  python scripts/fetch_deps.py "sqlalchemy==2.0.44"
  ```

  `backend/conftest.py` 会自动把 `.pylib` 加进 `sys.path`，`pytest` 仍是一条命令。

## 安全边界

- **提现与转账永久禁止**：交易所 API key 不开提现权限，只开交易权限 + IP 白名单。
- **实盘前必须有影子跟单阶段**：先跑通全链路但不下单，用真实滑点与对账数据验证价值。
- **风控硬上限**独立于策略代码：单笔、总仓、日内亏损；另有不依赖数据库的 kill switch。
- **以机器人全量持仓快照为准核对**：信号只触发，快照负责最终确认（信号可能被编辑或删除）。
- 凭据只放在服务器 `.env`，不入库、不进前端、不进 git。
