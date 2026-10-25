# 文献管理系统启动脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  文献管理系统" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否已安装依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "请先运行 .\install.ps1 安装依赖" -ForegroundColor Red
    exit 1
}

# 构建客户端
Write-Host "构建客户端应用..." -ForegroundColor Yellow
cd client
pnpm run build
cd ..
Write-Host "✓ 客户端构建完成" -ForegroundColor Green
Write-Host ""

# 启动服务器
Write-Host "启动服务器..." -ForegroundColor Yellow
Write-Host ""
pnpm run start
