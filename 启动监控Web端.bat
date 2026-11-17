@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 熬鹰资本·交易监控启动器

echo ========================================================
echo        正在启动 熬鹰交易监控系统 (后端 + Web端)
echo ========================================================
echo.
echo [1/2] 正在启动后端服务 (端口 8000)...
start "熬鹰监控-后端API (8000)" cmd /k "chcp 65001 >nul && cd /d %~dp0backend && set PYTHONPATH=%~dp0backend\.pylib;%~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [2/2] 正在启动前端服务 (端口 5173)...
start "熬鹰监控-Web前端 (5173)" cmd /k "chcp 65001 >nul && cd /d %~dp0web && npm run dev"

echo.
echo 等待 5 秒服务初始化...
timeout /t 5 >nul
echo 正在自动打开网页...
start http://localhost:5173

echo.
echo ========================================================
echo 启动完成！
echo 监控页面: http://localhost:5173
echo 默认账号: admin
echo 默认密码: admin123
echo ========================================================
echo 提示：关闭弹出的两个控制台黑框即可停止服务。
timeout /t 10
