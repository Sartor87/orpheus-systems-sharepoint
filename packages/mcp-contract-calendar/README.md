# @orpheussystems/mcp-contract-calendar

MCP server for the contract calendar. This README is completed by later tasks.

## Module loading

Spike results (Node 22.23.1 in the Podman dev container):

- Plain Node: `require('@orpheussystems/shared-core/sharepoint')` works, because Node 22.23 loads the ESM `@pnp/sp` through `require(esm)`. Output of the check `typeof s.SharePointDataService, typeof s.mapContract`: `function function`.
- Jest (ts-jest, CommonJS loader): importing `@orpheussystems/shared-core/sharepoint` fails with `Must use import to load ES Module: .../node_modules/@pnp/sp/webs/index.js`.

Rule: unit-tested modules import pure shared-core code only. That means the root barrel `@orpheussystems/shared-core`, and for mappers and queries the deep paths `@orpheussystems/shared-core/lib/data/spMappers` and `@orpheussystems/shared-core/lib/data/spQueries`. Modules that import PnPjs (`sharepoint/createSpfi.ts`, `sharepoint/SharePointContractDirectory.ts`, `sharepoint/agentRoles.ts`, `context/contextFactory.ts`) are kept thin and are not imported by Jest tests.

shared-core must be built (`npm run build:shared`) before the tests run.

## Local configuration

Copy `.env.sample` to `.env` (gitignored). The `mcp` compose service reads it if present.

## Running locally (no SharePoint, no Entra)

Set `AUTH_MODE=none`, `DATA_MODE=local`, `LOCAL_USER_ID=1` in `.env`, then `podman compose run --rm --service-ports mcp`. The server listens on `http://localhost:8787/mcp` (stateless Streamable HTTP; `GET /healthz` for liveness).

Manual check with MCP Inspector (needs Node on some machine or a second container):

```
npx @modelcontextprotocol/inspector
```

Connect with transport "Streamable HTTP" to `http://localhost:8787/mcp`, list tools, call `book_days` with `from=2026-11-02`, `to=2026-11-06`. Expected: 5 booked. An automated equivalent runs in `src/__tests__/app.test.ts` (SDK client over HTTP).

## Type checking

Jest transpiles only (`isolatedModules`); run `npm run typecheck` for type errors. The MCP SDK `registerTool` is called through a loosely typed wrapper in `src/mcp/createMcpServer.ts` because its zod-driven generics exhaust memory in tsc with zod 3.25.
