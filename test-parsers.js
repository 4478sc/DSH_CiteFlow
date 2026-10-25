/**
 * 解析器冒烟测试：读取 dist/ 编译产物，样本不再硬编码绝对路径。
 *
 * 用法：
 *   npm run test:parsers                # 会先提示需要 npm run build:server
 *   node test-parsers.js [额外样本文件...]
 *
 * 样本来源（按顺序全部执行）：
 *   1. 内置合成样本：多记录、CRLF、含非法类型，保证无外部样本也能跑；
 *   2. samples/ 目录下的真实 .ris / .ciw 文件（仓库自带）；
 *   3. 命令行参数指定的文件。
 *
 * 退出码：0 = 全部通过，1 = 存在断言失败或 dist/ 缺失。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(ROOT, 'dist', 'parsers');

let parseRISWithDiagnostics;
let parseWoSWithDiagnostics;

try {
  ({ parseRISWithDiagnostics } = await import('./dist/parsers/ris-parser.js'));
  ({ parseWoSWithDiagnostics } = await import('./dist/parsers/wos-parser.js'));
} catch (error) {
  console.error('无法加载 dist/ 中的解析器。请先运行：npm run build:server');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/* ---------------------------------------------------------------- 断言框架 */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    const suffix = detail ? ' — ' + detail : '';
    failures.push(name + suffix);
    console.log('  FAIL ' + name + suffix);
  }
}

/* ---------------------------------------------------------------- 内置样本 */

const RIS_FIXTURE = [
  'TY  - JOUR',
  'TI  - Attention Is All You Need',
  'AU  - Vaswani, Ashish',
  'AU  - Shazeer, Noam',
  'PY  - 2017',
  'JO  - Advances in Neural Information Processing Systems',
  'DO  - 10.48550/arXiv.1706.03762',
  'ER  - ',
  '',
  'TY  - CONF',
  'TI  - Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
  'AU  - Wei, Jason',
  'PY  - 2022',
  'ER  - ',
  '',
].join('\r\n'); // 故意用 CRLF，覆盖换行兼容

const WOS_FIXTURE = [
  'FN Clarivate Analytics Web of Science',
  'VR 1.0',
  'PT J',
  'AU Sharma, PK',
  '   Nallam, N',
  'TI Breaking the Performance Tradeoffs in N-Path Mixer-First Receivers',
  'SO IEEE JOURNAL OF SOLID-STATE CIRCUITS',
  'PY 2020',
  'DI 10.1109/JSSC.2020.3005776',
  'ER',
  '',
  'PT C',
  'AU Doe, John',
  'TI A Conference Paper About Testing Parsers',
  'PY 2019',
  'ER',
  '',
].join('\n');

const RIS_INVALID_FIXTURE = [
  'TY  - NONSENSE',
  'TI  - Record With An Unknown Type',
  'ER  - ',
  '',
].join('\n');

/* ---------------------------------------------------------------- 工具函数 */

function formatOf(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.ciw' || extension === '.wos' ? 'wos' : 'ris';
}

function parseWith(filePath, content, format) {
  return format === 'wos' ? parseWoSWithDiagnostics(content) : parseRISWithDiagnostics(content);
}

function assertParseResult(label, result) {
  check(label + ': 返回 references/errors/warnings 三个数组',
    Array.isArray(result.references) && Array.isArray(result.errors) && Array.isArray(result.warnings),
    '实际 keys = ' + Object.keys(result).join(','));
}

/* ---------------------------------------------------------------- 1. 内置 */

console.log('1) 内置合成样本');
const risResult = parseRISWithDiagnostics(RIS_FIXTURE);
assertParseResult('RIS(CRLF)', risResult);
check('RIS(CRLF): 解析出 2 条记录', risResult.references.length === 2, '实际 ' + risResult.references.length);
check('RIS(CRLF): 无 error', risResult.errors.length === 0, JSON.stringify(risResult.errors));
check('RIS(CRLF): JOUR -> article', risResult.references[0]?.type === 'article', String(risResult.references[0]?.type));
check('RIS(CRLF): CONF -> inproceedings', risResult.references[1]?.type === 'inproceedings', String(risResult.references[1]?.type));
check('RIS(CRLF): 标题正确', risResult.references[0]?.title === 'Attention Is All You Need', String(risResult.references[0]?.title));
check('RIS(CRLF): 作者数 = 2', (risResult.references[0]?.authors ?? []).length === 2, JSON.stringify(risResult.references[0]?.authors));
check('RIS(CRLF): 年份 = 2017', risResult.references[0]?.year === 2017, String(risResult.references[0]?.year));
check('RIS(CRLF): DOI 正确', risResult.references[0]?.doi === '10.48550/arXiv.1706.03762', String(risResult.references[0]?.doi));

const wosResult = parseWoSWithDiagnostics(WOS_FIXTURE);
assertParseResult('WoS', wosResult);
check('WoS: 解析出 2 条记录', wosResult.references.length === 2, '实际 ' + wosResult.references.length);
check('WoS: PT J -> article', wosResult.references[0]?.type === 'article', String(wosResult.references[0]?.type));
check('WoS: PT C -> inproceedings', wosResult.references[1]?.type === 'inproceedings', String(wosResult.references[1]?.type));
check('WoS: 续行合并进作者', (wosResult.references[0]?.authors ?? []).length === 2, JSON.stringify(wosResult.references[0]?.authors));
check('WoS: DOI 正确', wosResult.references[0]?.doi === '10.1109/JSSC.2020.3005776', String(wosResult.references[0]?.doi));

console.log('2) 异常输入');
const invalidResult = parseRISWithDiagnostics(RIS_INVALID_FIXTURE);
assertParseResult('RIS(未知类型)', invalidResult);
check('RIS(未知类型): 至少产生 1 条诊断',
  invalidResult.errors.length + invalidResult.warnings.length >= 1,
  'errors=' + invalidResult.errors.length + ' warnings=' + invalidResult.warnings.length);

const emptyResult = parseRISWithDiagnostics('');
check('RIS(空内容): 不抛异常且 0 条记录', emptyResult.references.length === 0, '实际 ' + emptyResult.references.length);

/* ---------------------------------------------------------------- 3. 真实 */

const cliFiles = process.argv.slice(2);
const sampleFiles = existsSync(path.join(ROOT, 'samples'))
  ? readdirSync(path.join(ROOT, 'samples'))
      .filter((name) => /\.(ris|ciw|wos)$/i.test(name))
      .map((name) => path.join(ROOT, 'samples', name))
  : [];

const realFiles = [...sampleFiles, ...cliFiles];
if (realFiles.length === 0) {
  console.log('3) 真实样本：samples/ 为空且未传 CLI 参数，跳过');
} else {
  console.log('3) 真实样本（' + realFiles.length + ' 个）');
  for (const file of realFiles) {
    if (!existsSync(file)) {
      check('样本存在: ' + file, false, '文件不存在');
      continue;
    }
    const content = readFileSync(file, 'utf-8');
    const format = formatOf(file);
    const result = parseWith(file, content, format);
    const label = path.basename(file) + ' (' + format + ')';
    assertParseResult(label, result);
    check(label + ': 至少 1 条记录', result.references.length >= 1, '实际 ' + result.references.length);
    check(label + ': 0 error', result.errors.length === 0, JSON.stringify(result.errors.slice(0, 3)));
    const missingTitle = result.references.filter((reference) => !reference.title || reference.title.trim() === '');
    check(label + ': 每条都有标题', missingTitle.length === 0, missingTitle.length + ' 条缺标题');
    const missingKeySource = result.references.filter((reference) => (reference.authors ?? []).length === 0);
    check(label + ': 每条都有作者', missingKeySource.length === 0, missingKeySource.length + ' 条缺作者');
  }
}

/* ---------------------------------------------------------------- 4. 时效 */

console.log('4) 构建产物');
const distEvidence = path.join(DIST_DIR, 'ris-parser.js');
const distTime = statSync(distEvidence).mtimeMs;
const sourceTime = statSync(path.join(ROOT, 'src', 'parsers', 'ris-parser.ts')).mtimeMs;
check('dist/ 不比源码旧', distTime >= sourceTime,
  'dist 落后于 src/parsers/ris-parser.ts，请重新 npm run build:server');

/* ---------------------------------------------------------------- 汇总 */

console.log('');
if (failures.length === 0) {
  console.log('全部通过：' + passed + ' 项断言');
  process.exit(0);
}
console.log('失败 ' + failures.length + ' 项，通过 ' + passed + ' 项：');
for (const failure of failures) console.log('  - ' + failure);
process.exit(1);