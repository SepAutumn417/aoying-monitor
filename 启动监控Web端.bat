@echo off
chcp 65001 >nul
title 熬鹰资本 · 交易监控启动器

echo ========================================================
echo        正在启动 熬鹰交易监控 系统 (后端 + Web端)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] 正在启动后端服务 (端口 8000)...
start "熬鹰监控-后端API服务" cmd /k "chcp 65001 >nul && cd /d "%~dp0backend" && set PYTHONPATH=%~dp0backend\.pylib;%~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo [2/2] 正在启动Web前端 (端口 5173)...
start "熬鹰监控-Web前端界面" cmd /k "chcp 65001 >nul && cd /d "%~dp0web" && npm run dev"

echo.
echo 等待服务初始化并自动拉起浏览器...
timeout /t 3 >nul
start http://localhost:5173

echo.
echo ========================================================
echo 启动成功！
echo - 监控网址：http://localhost:5173
echo - 登录账号：admin
echo - 登录密码：admin123
echo ========================================================
echo.
echo 提示：关闭弹出的两个黑框窗口即可停止服务。
pause
