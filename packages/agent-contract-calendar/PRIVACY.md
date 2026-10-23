# Privacy notice: Contract Calendar agent

Applies to the Contract Calendar declarative agent for Microsoft 365 Copilot and its MCP server
(`packages/mcp-contract-calendar`), published by Orpheus Systems as open-source sample software
under the Apache License 2.0.

> This notice describes what the software does. An organisation that deploys the agent is the
> controller of the data it processes and should adapt this notice, with legal review, before
> offering the agent to its users.

## Who runs it

Orpheus Systems does not operate a hosted service for this agent. The organisation that installs
it runs the MCP server on its own infrastructure, registers it in its own Microsoft Entra tenant and
publishes the agent in its own Microsoft 365 app catalog. Orpheus Systems receives no data from
these installations.

## What data the agent processes

When a signed-in user talks to the agent, Microsoft 365 Copilot calls the MCP server with a token
for that user. The server exchanges the token on behalf of the user and reads or writes SharePoint
lists in the organisation's own tenant, with the user's own permissions:

- contracts the user is allowed to see: contract numbers, contractor and contract manager names
  and e-mail addresses, vendor (company) name, dates, target and used days;
- calendar entries of those contracts (date, on-site or off-site, full or half day, note);
- public holidays.

The server keeps no database of its own. It does not store the user's chat prompts or Copilot's
answers.

## Audit log

For every tool call the server writes one audit line to the location the organisation configures
(standard output or a file): time, user object id and user principal name, SharePoint user id, the
tool name and its arguments, the outcome, the dates and SharePoint item ids it changed, the token
identifier and a correlation id. Retention and access are decided by the organisation that runs
the server.

## Microsoft services

Prompts and responses in Microsoft 365 Copilot, sign-in, and SharePoint storage are processed by
Microsoft under the organisation's agreement with Microsoft. See the Microsoft Privacy Statement
and the organisation's Microsoft 365 data protection terms.

## Contact

Questions about this sample software: Orpheus Systems, https://orpheussystems.com/. Questions about
a specific installation go to the organisation that runs it.
