# 文献管理系统 - 生产模式启动脚本
Write-Host "=== 文献管理系统 - 生产模式 ===" -ForegroundColor Cyan
Write-Host ""

# 检查构建
if (-not (Test-Path "client/dist")) {
    Write-Host "未找到前端构建，正在构建..." -ForegroundColor Yellow
    cd client
    npm run build
    cd ..
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ 前端构建失败" -ForegroundColor Red
        exit 1
    }
}

# 创建必要目录
$dirs = @("data", "storage", "uploads")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

Write-Host "正在启动服务器..." -ForegroundColor Yellow
Write-Host "访问地址: http://localhost:3000" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
Write-Host ""

# 启动生产服务器
npm start
