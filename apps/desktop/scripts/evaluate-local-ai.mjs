// Explicit developer evaluation. Requires imported/downloaded catalog models; never downloads implicitly.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalAiManager } from '../dist/main/local-ai.js';
const desktop = fileURLToPath(new URL('../', import.meta.url));
const home = process.argv[2];
if (!home) throw new Error('Usage: node scripts/evaluate-local-ai.mjs <model-storage> [cpu|vulkan]');
const backend = process.argv[3] || 'cpu';
if (!['cpu', 'vulkan'].includes(backend)) throw new Error('Invalid backend.');
const manager = new LocalAiManager(path.join(desktop, 'vendor/local-ai'), path.resolve(home));
const key = readFileSync(path.join(home, 'runtime.key'), 'utf8').trim();
const report = [];
try {
  for (const id of manager.status().installed) {
    await manager.start(id, backend);
    const state = manager.status();
    const row = { id, backend, timestamp: new Date().toISOString(), toolTest: state.toolTestPassed, tokensPerSecond: state.measuredTokensPerSecond, error: state.error, cases: [] };
    if (state.phase === 'ready') {
      const ask = async (messages, tools) => {
        const result = await fetch(state.endpoint + '/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000), body: JSON.stringify({ model: id, messages, ...(tools ? { tools } : {}), temperature: 0, max_tokens: 256, chat_template_kwargs: { enable_thinking: false } }) });
        if (!result.ok) throw new Error(`Evaluation HTTP ${result.status}`);
        return (await result.json()).choices[0].message;
      };
      const tools = [{ type: 'function', function: { name: 'add', description: 'Addiere a und b.', parameters: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'], additionalProperties: false } } }];
      const user = { role: 'user', content: 'Rufe add mit a=2 und b=3 auf und nenne anschließend das Ergebnis auf Deutsch.' };
      const call = await ask([user], tools);
      const tool = call.tool_calls?.[0];
      if (tool?.function.name === 'add' && tool.function.arguments) {
        const args = JSON.parse(tool.function.arguments);
        const answer = await ask([user, call, { role: 'tool', tool_call_id: tool.id, content: JSON.stringify({ result: args.a + args.b }) }], tools);
        row.cases.push({ name: 'two-step tool result', passed: args.a === 2 && args.b === 3 && /5/.test(answer.content || '') && !answer.tool_calls?.length, output: answer.content });
      } else row.cases.push({ name: 'two-step tool result', passed: false });
      const missing = await ask([{ role: 'user', content: 'Ich möchte zwei Zahlen addieren, habe sie aber noch nicht genannt. Frage nach den Zahlen. Erfinde keine Argumente und rufe kein Werkzeug auf.' }], tools);
      row.cases.push({ name: 'missing arguments', passed: !missing.tool_calls?.length && Boolean(missing.content?.trim()), output: missing.content });
      const german = await ask([{ role: 'user', content: 'Antworte auf Deutsch mit genau dem Wort: bereit' }]);
      row.cases.push({ name: 'German instruction', passed: (german.content || '').trim().toLowerCase().replace(/[.!]/g, '') === 'bereit', output: german.content });
    }
    report.push(row); await manager.stop();
  }
} finally { await manager.stop(true); }
const output = path.join(desktop, '../../..', 'output/local-ai-evaluation'); mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, `evaluation-${backend}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
