# 熬鹰资本 · 交易监控

只读监控系统：把熬鹰资本在 Telegram、X、OKX、fomo（链上）以及 Binance（经 TG 推断）的动作，
汇成一条可检索的时间线，并在仓位变化时推送到 Android 手机与 Web 页面。

> 当前进度：**I2 Telegram 采集**（I0 骨架、I1 登录/设备/实时推送已完成）。
> Telegram 发言已能落库并实时进时间线；持仓、提醒与其余四个来源仍是示例数据。

## 结构

```
backend/    FastAPI 服务（Python 3.12+），/healthz 健康检查
web/        React + Vite + Tailwind 的 Web 控制台
app/        Flutter Android 客户端（I0 只有骨架）
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

- 全系统**只读**：不接交易下单接口，不保存交易所的提现权限密钥。
- OKX 只使用只读 API key；fomo 只用一次性钱包解析，之后走公共 RPC。
- 凭据只放在服务器 `.env`，不入库、不进前端、不进 git。
