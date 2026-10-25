# 测试用户实际文件
Write-Host "=== 文件导入测试 ===" -ForegroundColor Cyan

$risFile = "F:\大创\引文数据包\IEEE Xplore Citation RIS Download 2022.9.1.9.11.56.ris"
$wosFile = "F:\大创\引文数据包\savedrecs (58).ciw"

if (Test-Path $risFile) {
    Write-Host "✓ RIS文件存在" -ForegroundColor Green
    $size = (Get-Item $risFile).Length / 1KB
    Write-Host "  大小: $([math]::Round($size, 2)) KB"
} else {
    Write-Host "✗ RIS文件未找到" -ForegroundColor Red
}

if (Test-Path $wosFile) {
    Write-Host "✓ WoS文件存在" -ForegroundColor Green
    $size = (Get-Item $wosFile).Length / 1KB
    Write-Host "  大小: $([math]::Round($size, 2)) KB"
} else {
    Write-Host "✗ WoS文件未找到" -ForegroundColor Red
}

Write-Host ""
Write-Host "提示: 启动系统后，在Web界面导入这些文件" -ForegroundColor Yellow
Write-Host "      1. 运行 .\start-dev.ps1"
Write-Host "      2. 访问 http://localhost:5173"
Write-Host "      3. 点击'导入'按钮，选择文件"
