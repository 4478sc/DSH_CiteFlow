# 快速上手指南

## 启动系统

### 开发模式
```powershell
.\start-dev.ps1
```
访问: http://localhost:5173

### 生产模式  
```powershell
.\start-prod.ps1
```
访问: http://localhost:3000

## 基本操作

### 1. 导入文献
- 点击"导入"按钮
- 选择RIS或WoS文件
- 选择目标分类
- 开始导入

### 2. 组织分类
- 点击"+"创建分类
- 拖拽文献到分类
- 支持多级嵌套

### 3. 导出BibTeX
- 勾选文献
- 点击"导出BibTeX"
- 保存.bib文件供LaTeX使用

## 文件格式

### 测试文件
您的实际文件:
- RIS: `F:\大创\引文数据包\IEEE Xplore Citation RIS Download 2022.9.1.9.11.56.ris`
- WoS: `F:\大创\引文数据包\savedrecs (58).ciw`
- BibTeX模板: `F:\硕博连读\C2项目\Thesis_2025\Bibliography\Reference_template`

## API端点

### V1 API (推荐)
- `GET /api/v1/papers` - 列表/搜索
- `POST /api/v1/imports` - 导入
- `POST /api/v1/exports/bibtex` - 导出

完整文档见 docs/architecture.md
