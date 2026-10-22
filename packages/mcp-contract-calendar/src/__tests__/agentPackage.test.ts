import * as fs from 'fs';
import * as path from 'path';
import { TOOL_NAMES } from '../mcp/createMcpServer';

const PKG = path.resolve(__dirname, '../../../agent-contract-calendar');
const APP = path.join(PKG, 'appPackage');

const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(APP, file), 'utf8'));

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'build' ? [] : listFiles(p);
    return [p];
  });
}

/** Tool names referenced by a plugin manifest: functions[].name, run_for_functions[] and inline MCP tools[].name. */
function referencedTools(plugin: any): string[] {
  const names: string[] = [];
  for (const f of plugin.functions ?? []) names.push(f.name);
  for (const r of plugin.runtimes ?? []) {
    for (const n of r.run_for_functions ?? []) names.push(n);
    for (const t of r.spec?.mcp_tool_description?.tools ?? []) names.push(t.name);
  }
  return names.filter(n => n !== '*');
}

describe('declarative agent package', () => {
  it('has JSON files that all parse', () => {
    const jsonFiles = fs.readdirSync(APP).filter(f => f.endsWith('.json'));
    expect(jsonFiles).toEqual(expect.arrayContaining(['manifest.json', 'declarativeAgent.json', 'ai-plugin.json']));
    for (const f of jsonFiles) expect(() => readJson(f)).not.toThrow();
  });

  it('mentions only tools the MCP server exposes (dynamic discovery: none is fine)', () => {
    const names = referencedTools(readJson('ai-plugin.json'));
    for (const n of names) expect(TOOL_NAMES as readonly string[]).toContain(n);
  });

  it('declares the MCP runtime with the server URL placeholder and Entra SSO', () => {
    const plugin: any = readJson('ai-plugin.json');
    const rt = plugin.runtimes.find((r: any) => r.type === 'RemoteMCPServer');
    expect(rt).toBeDefined();
    expect(rt.spec.url).toBe('${{MCP_SERVER_URL}}');
    expect(rt.auth).toEqual({ type: 'OAuthPluginVault', reference_id: '${{MCP_AUTH_REFERENCE_ID}}' });
  });

  it('instruction.txt covers needs_choice and stays under the 8000 character limit', () => {
    const text = fs.readFileSync(path.join(APP, 'instruction.txt'), 'utf8');
    expect(text).toContain('needs_choice');
    expect(text.length).toBeLessThan(8000);
  });

  it('contains no GUIDs (other than ${{...}} placeholders) and no real tenant host', () => {
    const guid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const file of listFiles(PKG)) {
      if (file.endsWith('.png')) continue;
      // The Vendor site column id is a fixed, repo-defined constant, not a tenant value.
      const text = fs
        .readFileSync(file, 'utf8')
        .replace(/\$\{\{[^}]*\}\}/g, '')
        .replace(/582b1c53-77a2-4a1b-918f-14e0b9eaff06/gi, '');
      expect({ file, hit: guid.test(text) }).toEqual({ file, hit: false });
      for (const m of text.matchAll(/([\w.<>-]*)sharepoint\.com/gi)) {
        expect({ file, host: m[0] }).toEqual({ file, host: '<tenant>.sharepoint.com' });
      }
    }
  });
});
