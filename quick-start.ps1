#!/usr/bin/env pwsh
# 快速启动 - 生产模式

Write-Host "启动文献管理系统..." -ForegroundColor Cyan

# 检查构建
if (-not (Test-Path "dist/server.js")) {
    Write-Host "⚠ 未找到构建产物，正在构建..." -ForegroundColor Yellow
    npm run build
}

# 启动服务器
Write-Host "`n✓ 服务器启动于 http://localhost:3000`n" -ForegroundColor Green
npm start