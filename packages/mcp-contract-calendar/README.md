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
