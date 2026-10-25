#!/usr/bin/env pwsh
# 文献管理系统 - 一键安装脚本

Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   文献管理系统 - 安装向导             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

try {
    # 检查Node.js
    Write-Host "1️⃣  检查Node.js..." -ForegroundColor Yellow
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Node.js $nodeVersion" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 未找到Node.js，请安装: https://nodejs.org" -ForegroundColor Red
        exit 1
    }

    # 安装后端依赖
    Write-Host "`n2️⃣  安装后端依赖..." -ForegroundColor Yellow
    npm install
    Write-Host "   ✓ 后端依赖安装完成" -ForegroundColor Green

    # 安装前端依赖
    Write-Host "`n3️⃣  安装前端依赖..." -ForegroundColor Yellow
    Push-Location client
    npm install
    Pop-Location
    Write-Host "   ✓ 前端依赖安装完成" -ForegroundColor Green

    # 构建项目
    Write-Host "`n4️⃣  构建项目..." -ForegroundColor Yellow
    npm run build:server
    Write-Host "   ✓ 后端构建完成" -ForegroundColor Green
    
    Push-Location client
    npm run build
    Pop-Location
    Write-Host "   ✓ 前端构建完成" -ForegroundColor Green

    # 运行测试
    Write-Host "`n5️⃣  运行集成测试..." -ForegroundColor Yellow
    npm run test:integration
    
    Write-Host "`n╔═══════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   ✓ 安装完成！                        ║" -ForegroundColor Green
    Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "启动服务器:" -ForegroundColor Cyan
    Write-Host "  npm start" -ForegroundColor White
    Write-Host ""
    Write-Host "然后访问:" -ForegroundColor Cyan
    Write-Host "  http://localhost:3000" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host "`n✗ 安装失败: $_" -ForegroundColor Red
    Write-Host "请检查错误信息后重试" -ForegroundColor Yellow
    exit 1
}