import { readFileSync } from 'fs';
import { parseRIS } from './src/parsers/ris-parser.js';
import { parseWoS } from './src/parsers/wos-parser.js';

// 测试RIS解析
console.log('Testing RIS parser...');
const risContent = readFileSync('F:\\大创\\引文数据包\\IEEE Xplore Citation RIS Download 2022.9.1.9.11.56.ris', 'utf-8');
const risRefs = parseRIS(risContent);
console.log(`Parsed ${risRefs.length} references from RIS`);
if (risRefs.length > 0) {
  console.log('First reference:', JSON.stringify(risRefs[0], null, 2));
}

console.log('\n---\n');

// 测试WoS解析
console.log('Testing WoS parser...');
const wosContent = readFileSync('F:\\大创\\引文数据包\\savedrecs (58).ciw', 'utf-8');
const wosRefs = parseWoS(wosContent);
console.log(`Parsed ${wosRefs.length} references from WoS`);
if (wosRefs.length > 0) {
  console.log('First reference:', JSON.stringify(wosRefs[0], null, 2));
}
