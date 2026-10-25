#!/usr/bin/env pwsh
# 开发模式 - 需要两个终端

Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   开发模式启动                         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "当前终端: 后端开发服务器" -ForegroundColor Yellow
Write-Host "请在另一个终端运行:" -ForegroundColor Yellow
Write-Host "  cd client && npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "然后访问: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

npm run dev