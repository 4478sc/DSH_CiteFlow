import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface DshResult { ok: boolean; text: string; error?: string; }
export interface DshOptions { workdir?: string; timeoutMs?: number; }

/** 归纳实际使用的 provider / model，可用环境变量覆盖。 */
export const INSIGHT_PROVIDER = process.env.DSH_INSIGHT_PROVIDER ?? 'openai';
export const INSIGHT_MODEL = process.env.DSH_INSIGHT_MODEL ?? 'gpt-6.1-sol';

/**
 * 各 provider 在 headless profile 里是空白的，必须把连接参数一起补上：
 * opencode-go 走 pi-ai 默认路由，只需要 apiKeyEnv；
 * aicodemirror1 是 OpenAI 兼容网关，需要 api/baseURL/models。
 */
function providerBlock(provider: string, model: string): string[] {
  if (provider === 'openai') {
    return [
      '      openai:',
      `        baseURL: ${process.env.DSH_INSIGHT_BASE_URL ?? 'http://127.0.0.1:18080/v1'}`,
      `        apiKeyEnv: ${process.env.DSH_INSIGHT_API_KEY_ENV ?? 'OPENAI_API_KEY'}`,
      '        models:',
      `          - id: ${model}`,
      `            name: ${model}`,
    ];
  }
  if (provider === 'aicodemirror1') {
    return [
      '      aicodemirror1:',
      '        displayName: aicodemirror1',
      `        apiKeyEnv: ${process.env.DSH_INSIGHT_API_KEY_ENV ?? 'AICODEMIRROR1_API_KEY'}`,
      '        api: openai-completions',
      '        baseURL: https://api.aicodemirror.ai/v1',
      '        models:',
      `          - id: ${model}`,
      `            name: ${model}`,
    ];
  }
  return [
    `      ${provider}:`,
    `        apiKeyEnv: ${process.env.DSH_INSIGHT_API_KEY_ENV ?? 'OPENCODE_GO_API_KEY'}`,
  ];
}

const quote = (value: string) => (value.includes(' ') ? `"${value}"` : value);

/**
 * headless profile 默认关闭凭据存储、也没有配置任何模型路由，直接调用只会得到
 * MISSING_CREDENTIAL。这里用 --patch 叠加一层仅本次调用生效的覆盖：
 * 启用 ~/.dsh/.credentials.yaml、注册 provider、并把默认模型指向可用路由。
 * 覆盖层不含任何密钥，密钥仍由 Harness 的凭据服务或环境变量提供。
 */
const buildOverlay = () => [
  '- id: credentials',
  '  disabled: false',
  '- id: llm-pi-ai',
  '  name: "@deepseek-ai/dsh-llm-pi-ai"',
  '  config:',
  '    providers:',
  ...providerBlock(INSIGHT_PROVIDER, INSIGHT_MODEL),
  '- id: agent-default-model',
  '  name: "@deepseek-ai/dsh-agent-default-model"',
  '  config:',
  `    provider: ${INSIGHT_PROVIDER}`,
  `    model: ${INSIGHT_MODEL}`,
].join('\n') + '\n';

async function resolveCli(appDir: string): Promise<string> {
  if (process.env.DSH_CLI) return process.env.DSH_CLI;
  try {
    const configured = (await readFile(path.join(appDir, '..', 'dsh-cli.txt'), 'utf8')).trim();
    if (configured) return configured;
  } catch {
    // 没有本机配置就走 PATH
  }
  return 'dsh';
}

export async function runDshTask(prompt: string, options: DshOptions = {}): Promise<DshResult> {
  const appDir = path.resolve(process.env.DSH_WORKDIR ?? 'data/dsh-tmp');
  await mkdir(appDir, { recursive: true });
  const overlay = path.join(appDir, 'headless.patch.yml');
  await writeFile(overlay, buildOverlay(), 'utf8');

  // 让 dsh 以附件所在目录为工作目录，模型才能读到 PDF；否则退回默认目录。
  const cwd = options.workdir ? path.resolve(options.workdir) : appDir;
  const timeoutMs = options.timeoutMs ?? Number(process.env.DSH_TIMEOUT_MS ?? 420000);
  // CLI 位置：环境变量 > data/dsh-cli.txt（本机配置，不入库）> PATH 里的 dsh。
  const cli = await resolveCli(appDir);
  const command = quote(cli);
  const args = ['--profile', 'headless', '--patch', quote(overlay), '--json', '-'];

  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env }, shell: true, windowsHide: true });
    let finalText = '';
    let stderr = '';
    let buffer = '';
    let settled = false;
    const finish = (result: DshResult) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, text: '', error: 'DeepSeek Harness 运行超时，请稍后重试。' });
    }, timeoutMs);

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as { type?: string; text?: string };
        if (event.type === 'final' && typeof event.text === 'string') finalText = event.text;
      } catch {
        // 非 JSON 输出（进度日志等）直接忽略
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => finish({ ok: false, text: '', error: error.message }));
    child.on('close', (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (code === 0 && finalText.trim()) {
        finish({ ok: true, text: finalText.trim() });
        return;
      }
      const detail = stderr.replace(/dsh: reasoning:[^\n]*\n?/g, '').trim();
      finish({ ok: false, text: finalText, error: detail || 'DeepSeek Harness 未返回有效结果。' });
    });
    child.stdin.end(prompt);
  });
}
