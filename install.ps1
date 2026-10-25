# 文献管理系统安装脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  文献管理系统 - 安装向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查Node.js和pnpm
Write-Host "检查依赖..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "错误: 未找到 Node.js，请先安装 Node.js" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "未找到 pnpm，正在安装..." -ForegroundColor Yellow
    npm install -g pnpm
}

Write-Host "✓ 环境检查完成" -ForegroundColor Green
Write-Host ""

# 安装服务端依赖
Write-Host "安装服务端依赖..." -ForegroundColor Yellow
pnpm install
Write-Host "✓ 服务端依赖安装完成" -ForegroundColor Green
Write-Host ""

# 安装客户端依赖
Write-Host "安装客户端依赖..." -ForegroundColor Yellow
cd client
pnpm install
cd ..
Write-Host "✓ 客户端依赖安装完成" -ForegroundColor Green
Write-Host ""

# 创建必要的目录
Write-Host "创建数据目录..." -ForegroundColor Yellow
if (-not (Test-Path "data")) { New-Item -ItemType Directory -Path "data" | Out-Null }
if (-not (Test-Path "pdfs")) { New-Item -ItemType Directory -Path "pdfs" | Out-Null }
if (-not (Test-Path "uploads")) { New-Item -ItemType Directory -Path "uploads" | Out-Null }
Write-Host "✓ 数据目录创建完成" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "运行以下命令启动系统:" -ForegroundColor Yellow
Write-Host "  .\start.ps1" -ForegroundColor Cyan
Write-Host ""
