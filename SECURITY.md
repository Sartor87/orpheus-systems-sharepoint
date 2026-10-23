# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately in one of these ways:

- through GitHub's **Report a vulnerability** button on the repository's **Security** tab (private vulnerability reporting); or
- by email to kiril.iliev@orpheussystems.com, with the subject line `Security: <short title>`.

Include the affected package, for example `wp-contract-calendar` or `mcp-contract-calendar`, the version, the steps to reproduce, and the impact you expect. You will get an acknowledgement within five working days and a plan for a fix once the report is confirmed.

## Scope

This repository is a reference implementation. Reports are welcome for:

- the SPFx solutions (web part and extensions) and their shared packages;
- the MCP server and the Copilot agent package;
- the provisioning scripts in `infra/provisioning`.

Some limitations are deliberate and documented as known gaps, so they are not vulnerabilities in themselves:

- Visibility in the web part is filtering, not item-level permissions ([ADR 0005](architecture/adr/0005-web-part-filtering-over-item-level-permissions.md)).
- The contract form's role check is a UI gate. Anyone with Contribute rights on the list can still edit an item through the list UI or the REST API.

A report showing that these gaps can be exploited in a way the architecture documents do not describe is welcome.

## Supported versions

Only the latest commit on `main` receives fixes.
