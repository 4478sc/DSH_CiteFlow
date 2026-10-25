Write-Host "=== API健康检查 ===" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/v1/health" -Method Get -TimeoutSec 5
    Write-Host "✓ 服务器运行正常" -ForegroundColor Green
    Write-Host "  版本: $($health.version)" -ForegroundColor Gray
    Write-Host "  状态: $($health.status)" -ForegroundColor Gray
} catch {
    Write-Host "✗ 服务器未响应" -ForegroundColor Red
    Write-Host "  请确认服务器已启动: .\start-dev.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "测试API端点:" -ForegroundColor Cyan

$endpoints = @(
    @{Method="GET"; Path="/api/v1/categories"; Name="分类列表"},
    @{Method="GET"; Path="/api/v1/papers"; Name="文献列表"},
    @{Method="GET"; Path="/api/v1/health"; Name="健康检查"}
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl$($endpoint.Path)" -Method $endpoint.Method -TimeoutSec 5
        Write-Host "  ✓ $($endpoint.Name) ($($endpoint.Path))" -ForegroundColor Green
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status) {
            Write-Host "  ✗ $($endpoint.Name) - HTTP $status" -ForegroundColor Red
        } else {
            Write-Host "  ? $($endpoint.Name) - 未实现或错误" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "提示: 完整功能需要前端界面，访问 http://localhost:5173" -ForegroundColor Gray
