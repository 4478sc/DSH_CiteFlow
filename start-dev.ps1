# 文献管理系统 - 开发模式启动脚本
Write-Host "=== 文献管理系统 - 开发模式 ===" -ForegroundColor Cyan
Write-Host ""

# 检查Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ 未找到Node.js，请先安装 Node.js 18+" -ForegroundColor Red
    exit 1
}

# 检查依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "首次运行，正在安装依赖..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ 依赖安装失败" -ForegroundColor Red
        exit 1
    }
}

# 创建必要目录
$dirs = @("data", "storage", "uploads")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
        Write-Host "✓ 创建目录: $dir" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "正在启动服务器..." -ForegroundColor Yellow
Write-Host "- 后端API: http://localhost:3000" -ForegroundColor Cyan
Write-Host "- 前端页面: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host ""

# 启动开发服务器
npm run dev
