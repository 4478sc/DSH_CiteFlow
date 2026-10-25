#!/usr/bin/env node
/**
 * 快速集成测试 - 验证核心功能
 * 运行: node integration-test.js
 */

import { ReferenceDatabase } from './dist/database/database.js';
import { parseRIS } from './dist/parsers/ris-parser.js';
import { exportBibTeX } from './dist/utils/bibtex-exporter.js';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';

const TEST_DB = './data/test-integration.db';
const TEST_OUTPUT = './data/test-output.bib';

console.log('🧪 文献管理系统集成测试\n');

// 清理旧测试数据
if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
if (existsSync(TEST_OUTPUT)) unlinkSync(TEST_OUTPUT);
if (!existsSync('./data')) mkdirSync('./data', { recursive: true });

try {
  // 1. 初始化数据库
  console.log('1️⃣  初始化数据库...');
  const db = new ReferenceDatabase(TEST_DB);
  console.log('   ✅ 数据库创建成功\n');

  // 2. 创建分类
  console.log('2️⃣  创建分类树...');
  const rootId = db.createFolder('机器学习', null);
  const childId = db.createFolder('深度学习', rootId);
  console.log(`   ✅ 根分类 ID: ${rootId}, 子分类 ID: ${childId}\n`);

  // 3. 解析 RIS 样本
  console.log('3️⃣  解析 RIS 引文...');
  const risSample = `TY  - JOUR
TI  - Attention Is All You Need
AU  - Vaswani, Ashish
AU  - Shazeer, Noam
PY  - 2017
JO  - Advances in Neural Information Processing Systems
VL  - 30
SP  - 5998
EP  - 6008
DO  - 10.48550/arXiv.1706.03762
ER  -
`;
  
  const risRecords = parseRIS(risSample);
  console.log(`   ✅ 解析到 ${risRecords.length} 条记录\n`);

  // 4. 导入文献
  console.log('4️⃣  导入文献到数据库...');
  const paperId = db.createReference({
    ...risRecords[0],
    folderId: childId
  });
  console.log(`   ✅ 文献 ID: ${paperId}\n`);

  // 5. 查询文献
  console.log('5️⃣  查询文献列表...');
  const papers = db.getReferences(childId);
  console.log(`   ✅ 找到 ${papers.length} 条文献`);
  console.log(`   📄 ${papers[0].title}\n`);

  // 6. 导出 BibTeX
  console.log('6️⃣  导出 BibTeX...');
  const allPapers = db.getReferences();
  const bibContent = exportBibTeX(allPapers);
  writeFileSync(TEST_OUTPUT, bibContent, 'utf8');
  console.log(`   ✅ 导出到 ${TEST_OUTPUT}\n`);

  // 7. 统计
  const stats = db.getStatistics();
  console.log('7️⃣  系统统计:');
  console.log(`   📊 总文献: ${stats.references}`);
  console.log(`   📊 总分类: ${stats.folders}`);
  console.log(`   📊 总附件: ${stats.files}（合计 ${stats.totalFileSize} 字节）\n`);

  db.close();
  console.log('✨ 所有测试通过！\n');

} catch (error) {
  console.error('❌ 测试失败:', error.message);
  process.exit(1);
}