# agent-contract-calendar

Declarative Microsoft 365 Copilot agent ("Contract Calendar") whose single action is the MCP server in `packages/mcp-contract-calendar`. This is a Microsoft 365 Agents Toolkit project. It has no dependencies and no npm scripts; the toolkit (VS Code extension or CLI) does the provisioning.

## Layout

| File | Purpose |
| --- | --- |
| `m365agents.yml` | Agents Toolkit lifecycle (create app, validate, zip, update, extend to Microsoft 365) |
| `env/.env.dev.sample` | Placeholders for the dev environment. Copy to `env/.env.dev` (gitignored). |
| `appPackage/manifest.json` | Microsoft 365 app manifest (schema 1.30) |
| `appPackage/declarativeAgent.json` | Declarative agent manifest (schema v1.8); instructions come from `instruction.txt` |
| `appPackage/ai-plugin.json` | Plugin manifest (schema v2.4), `RemoteMCPServer` runtime, Entra SSO |
| `appPackage/instruction.txt` | Agent instructions (limit 8000 characters) |

## Environment variables

| Variable | Meaning |
| --- | --- |
| `TEAMS_APP_ID` | Written by `teamsApp/create` during provision |
| `MCP_SERVER_URL` | Public HTTPS URL of the MCP server including `/mcp` (for dev, the dev tunnel URL) |
| `MCP_AUTH_REFERENCE_ID` | Auth config id of the Entra SSO registration (see below) |
| `APP_NAME_SUFFIX` | Suffix appended to the app name, e.g. `dev` |

## Entra SSO setup (owner step)

1. Register the MCP server API in Entra (the same app registration the server validates tokens against).
2. In the Teams developer portal, Tools, "Microsoft Entra SSO client ID registration", create a registration with the MCP server base URL and the Entra app client id. Copy the generated registration id into `MCP_AUTH_REFERENCE_ID`. Agents Toolkit can do this for you when you add the MCP action ("Entra SSO").
3. Add the registration's Application ID URI to `identifierUris` of the Entra app, add the `oAuthConsentRedirect` redirect URI under Web authentication, and pre-authorize the Microsoft Enterprise token store client application under Expose an API (see the Learn page below for the exact values).
4. Make sure the server accepts the new Application ID URI as a token audience (see the server README for its audience setting).

## Tools: dynamic discovery

`ai-plugin.json` uses the Agents Toolkit default, dynamic tool discovery: `functions` is empty and `run_for_functions` is `["*"]`, so Copilot reads the tool list and schemas from the MCP server at runtime. Nothing here needs updating when a tool changes. `agentPackage.test.ts` in `mcp-contract-calendar` checks that any tool name mentioned in the plugin exists in the server's `TOOL_NAMES`.

Dynamic discovery has one cost: the plugin manifest no longer lists the write tools, so there is no
per-function place for a confirmation hint. The confirmation step lives in `instruction.txt`
(restate dates, type and contract, confirm once, then one `book_days` call), and the server refuses
writes by anyone but the contract's contractor. MCP tool annotations (`destructiveHint`) are the
candidate fix once Copilot honours them.

## Demo

- `demo/demo-procedure.md`: prerequisites, start order, the three demo users, the verification log
  for the live run.
- `demo/prompt-set.md`: prompts with the expected tool call, arguments and outcome.
- `docs/architecture-amendments.md`: changes to existing architecture documents for the owner to
  apply at merge.

Decisions behind the package are in `architecture/adr/XXXX-declarative-agent-entra-sso-obo.md` and
`architecture/adr/XXXX-dev-tunnel-for-the-agent-demo.md`.

## Sources used

- Build a plugin from an MCP server: https://learn.microsoft.com/microsoft-365/copilot/extensibility/build-mcp-plugins
- Entra SSO for plugins: https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-authentication-entra-sso
- Plugin manifest 2.4: https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-manifest-2.4
- Dynamic tool discovery / pinned tools: https://learn.microsoft.com/microsoft-365/copilot/extensibility/plugin-dynamic-tool-discovery
- Declarative agent manifest 1.8: https://learn.microsoft.com/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.8

## Items to verify when first provisioning

These were written from the documentation without running the toolkit:

- `m365agents.yml`: the `v1.9` yaml schema version and the exact action list (`teamsApp/extendToM365` outputs). Compare with a freshly scaffolded "Start with an MCP Server" project and align.
- `manifest.json`: `manifestVersion` 1.30 (the page I read lists 1.30 as current); lower it if the installed toolkit rejects it.
- `declarativeAgent.json`: `v1.8` was not fetched in full (v1.6 was); only fields common to both are used. The `$[file('instruction.txt')]` include is the toolkit syntax.
- `ai-plugin.json`: `security_info.data_handling` on the write tools and the `capabilities.conversation_starters` block follow the 2.4 reference.
