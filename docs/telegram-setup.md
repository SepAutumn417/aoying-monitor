# 怎么拿到 Telegram 的 `api_id` / `api_hash`

这两个值是**你自己账号的开发者凭证**，不是熬鹰的、也不能在网上买或借用别人的。整个流程免费，五分钟能做完。

## 前提

1. 一个**能正常收发消息的 Telegram 账号**（后面采集器就是用这个账号的视角去看群）。
2. 这个账号**已经加入了要监控的那 4 个群**——采集器只读它能看到的会话，没加入的群看不到。
3. 能访问 `my.telegram.org`（国内需要梯子，服务器在大阪则直接可达）。

## 第一步：登录 my.telegram.org

打开 <https://my.telegram.org>，在 `Your phone number` 里填**带国际区号的手机号**（例：`+8613800000000`），点 `Next`。

几秒内，你的 Telegram App 会收到一条来自 **Telegram**（官方服务号，不是别人）的消息，里面是登录码。把码填进 `Confirmation code`，点 `Sign in`。

> 收不到码的常见原因：手机号填错区号、梯子节点被 Telegram 限制、账号刚注册不久。换节点重试通常就好。

## 第二步：创建应用

登录成功后点 **API development tools**（也可以直接开 <https://my.telegram.org/apps>），填这张表：

| 字段 | 填什么 |
| --- | --- |
| App title | 随便，英文，例：`aoying-monitor` |
| Short name | 随便，英文小写，例：`aoyingmonitor`（被占用就换一个，比如加数字） |
| URL | 留空 |
| Platform | 选 `Desktop` 或 `Other` |
| Description | 随便，例：`Read-only channel monitor` |

点 `Create application`。成功后页面顶部会显示：

```
App api_id:   1234567
App api_hash: 0123456789abcdef0123456789abcdef
```

**这两个就是你要的东西。** 页面关掉后还能再进来看，不会丢。

> 报 `ERROR` 大多是 `Short name` 已被占用，换个名字再点一次即可。

## 第三步：写进 `.env`

仓库根目录的 `.env`（已经帮你从 `.env.example` 生成好了，且被 `.gitignore` 排除，不会进 git）：

```ini
TG_API_ID=1234567
TG_API_HASH=0123456789abcdef0123456789abcdef
```

同时确认这几行（本机跑用相对路径，Docker 里用 `/data/...`，compose 会自动覆盖）：

```ini
TG_SESSION_PATH=./data/telegram.session
TG_MEDIA_DIR=./data/media
TG_BACKFILL_LIMIT=200
TG_SYNC_INTERVAL_SECONDS=300
TG_AUTO_START=false
```

## 第四步：一次性登录，生成 session 文件

`api_id` / `api_hash` 只是「哪个应用」，还需要用**你的手机号**登录一次，把授权结果存成 `data/telegram.session`。之后采集器直接读这个文件，不再需要验证码。

```bash
cd backend
python -m app.telegram_login
```

按提示输入手机号和收到的验证码；开了两步验证会再问一次密码。成功时输出类似：

```
已登录：熬鹰 @xxx
会话文件：./data/telegram.session
可加入的会话 87 个，前 20 个：
       -1001234567890  熬鹰｜观点群
       ...
```

这一步会同时把账号信息写进数据库，并把**它能看到的所有会话**列出来——用它核对 4 个目标群是否都在列表里、`chat_id` 是多少。

> 验证码也可以免交互传：`TG_PHONE=+86138... TG_CODE=12345 python -m app.telegram_login`；两步验证密码用 `TG_2FA`。

## 第五步：启动采集并关注群

```bash
cd backend
python -m uvicorn app.main:app --port 8000
```

打开 Web →「数据源」→ `启动` → `发现会话` → 在列表里勾选那 4 个群。首次关注会自动补最近 200 条，之后常驻监听 + 每 5 分钟补洞。

## 安全与限制

- **`api_hash` 等于账号的开发者密码**。泄露了别人可以冒充你的应用登录；真泄露就去 <https://my.telegram.org/apps> 点 `Revoke` 重新生成，然后更新 `.env` 重跑第四步。
- 一个手机号**只能绑定一个** `api_id`（官方限制）。想换应用得先删旧的。
- 这个账号会被 Telegram 视为「在用第三方客户端」。**只用来看，不要用它发消息、加人、刷接口**，否则容易触发风控。本项目是只读监听、低频轮询，正常使用不会被封。
- `data/telegram.session` 就是登录态本身，**等同于密码**。它已在 `.gitignore` 里，别手工复制到别处或发群里。
- 会话文件与媒体目录在 Docker 里必须挂卷（`docker-compose.yml` 已配 `./data:/data`），否则每次重启都要重新登录。
