# 维护任务清单

## 日常维护

### 数据库备份

```powershell
# 备份数据库和文件
$date = Get-Date -Format "yyyyMMdd"
Copy-Item data/ -Destination "backup/data_$date" -Recurse
Copy-Item storage/ -Destination "backup/storage_$date" -Recurse
```

### 日志检查

```powershell
# 查看应用日志（如有）
Get-Content logs/app.log -Tail 100
```

### 数据库优化

```powershell
# SQLite VACUUM（压缩数据库）
sqlite3 data/references.db "VACUUM;"

# 分析表统计信息
sqlite3 data/references.db "ANALYZE;"
```

## 功能扩展

### [ ] 添加用户认证

- [ ] 实现JWT认证中间件
- [ ] 添加用户表和登录接口
- [ ] 前端添加登录页面
- [ ] 更新CORS配置

### [ ] 支持更多引文格式

- [ ] EndNote XML
- [ ] BibTeX 导入
- [ ] PubMed
- [ ] arXiv

### [ ] 增强搜索功能

- [ ] 全文索引（SQLite FTS5）
- [ ] 高级过滤器
- [ ] 保存搜索条件
- [ ] 搜索历史

### [ ] PDF处理

- [ ] PDF文本提取
- [ ] 自动元数据提取
- [ ] PDF预览缩略图
- [ ] 批注和高亮

### [ ] 导出格式

- [ ] Word文档
- [ ] Excel表格
- [ ] JSON/CSV
- [ ] 引用格式化（APA, MLA等）

## 性能优化

### [ ] 数据库索引

```sql
-- 添加常用查询的复合索引
CREATE INDEX idx_papers_category_year ON papers(category_id, year DESC);
CREATE INDEX idx_papers_search ON papers(title, authors_json);
```

### [ ] 前端优化

- [ ] 虚拟滚动（大列表）
- [ ] 图片懒加载
- [ ] 请求缓存
- [ ] Service Worker（离线支持）

### [ ] 后端优化

- [ ] 添加Redis缓存
- [ ] 数据库连接池
- [ ] 静态文件CDN
- [ ] Gzip压缩

## 测试增强

### [ ] 单元测试覆盖

- [ ] 解析器边界情况
- [ ] BibTeX特殊字符
- [ ] 数据库事务回滚
- [ ] 文件上传验证

### [ ] 端到端测试

- [ ] Playwright自动化测试
- [ ] 导入导出完整流程
- [ ] 多用户并发测试

### [ ] 性能测试

- [ ] 大数据量测试（10k+ 文献）
- [ ] 并发导入测试
- [ ] 搜索响应时间

## 部署增强

### [ ] Docker支持

```dockerfile
# 创建 Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npm", "start"]
```

### [ ] CI/CD

- [ ] GitHub Actions自动测试
- [ ] 自动部署到服务器
- [ ] 版本号管理

### [ ] 监控告警

- [ ] 健康检查端点
- [ ] 错误日志收集
- [ ] 性能指标监控

## 文档更新

### [ ] API文档

- [ ] 使用Swagger/OpenAPI
- [ ] 交互式API测试
- [ ] 示例请求/响应

### [ ] 用户手册

- [ ] 视频教程
- [ ] 常见问题FAQ
- [ ] 最佳实践指南

## 安全加固

### [ ] 输入验证

- [ ] 文件类型白名单
- [ ] 文件大小限制
- [ ] SQL注入防护（已有参数化查询）
- [ ] XSS防护

### [ ] 访问控制

- [ ] 角色权限系统
- [ ] API速率限制
- [ ] HTTPS强制

### [ ] 数据保护

- [ ] 定期自动备份
- [ ] 敏感数据加密
- [ ] 审计日志

---

**维护负责人**: [待分配]
**最后检查**: 2026-10-25
