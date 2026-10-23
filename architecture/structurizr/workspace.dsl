// Structurizr DSL workspace for the Orpheus Systems Contract Calendar for SharePoint.
//
// Source of truth: architecture/00..10 (TOGAF ADM), architecture/adr/*.md and the code under
// packages/, infra/ and compose.yml, read on 2026-10-23. Where the model and the TOGAF documents
// disagree, the model follows the code and the difference is listed in docs/02-model-notes.md.
// Nothing here names a tenant, a user or a secret; placeholders only.
//
// Render: see docs/03-how-to-render.md (Structurizr Lite through compose.yml next to this file,
// or the Structurizr CLI). Both run in Podman. The ADRs are imported from ../adr, the docs from ./docs.

workspace "Orpheus Contract Calendar for SharePoint" "C4 model of the SPFx suite, the Copilot contract agent and the SharePoint site they share. TOGAF documents and ADRs live in architecture/." {

    !identifiers hierarchical
    !adrs ../adr
    !docs docs

    model {

        properties {
            "structurizr.groupSeparator" "/"
        }

        // ------------------------------------------------------------------
        // People
        // ------------------------------------------------------------------

        contractor = person "Contractor" "Consultant placed on one or more procurement contracts. Marks on-site and off-site days, full or half, and prints the timesheet. Books days through the Copilot agent too." "User"
        manager = person "Contract manager" "Creates and edits the contracts they manage, watches used and remaining days, generates the timesheet. Read-only on calendar days. Reads contracts by vendor through the agent." "User"
        admin = person "Site admin" "Member of the site Owners group. Edits any contract, maintains the Holidays list, configures the web part, runs the provisioning scripts." "User"
        hr = person "HR" "Member of the SharePoint group named by HR_GROUP (default Orpheus HR). Exists only in the agent: sees all contracts grouped by vendor, read only." "User"
        approver = person "Approving organisation" "The client that signs the printed timesheet. Never named in code; a configurable label with the default Client approval." "External"
        developer = person "Owner / developer" "Orpheus Systems. Builds in the Podman container, packages the .sppkg files, provisions sites, hosts the agent demo, integrates branches." "Developer"

        // ------------------------------------------------------------------
        // The SPFx suite
        // ------------------------------------------------------------------

        suite = softwareSystem "Contract Calendar suite" "SharePoint Framework 1.23.2 solution: one web part, three extensions and two shared libraries. Runs entirely in the browser inside SharePoint Online pages; no server component. Tracks on-site and off-site days against procurement contracts and prints the timesheet PDF." "Suite" {

            core = container "shared-core" "Models, business rules (one entry per contractor per date, blocked weekends and holidays, recomputed used days), date handling, role derivation and the IDataService seam with a Local and a SharePoint implementation. Shared by every SPFx package and by the MCP server." "TypeScript library, npm workspace @orpheussystems/shared-core" "Library" {
                models = component "models" "Contract, CalendarEntry, Holiday, UserInfo, Role, EntryType and the other domain types." "TypeScript, src/models.ts"
                rules = component "rules" "Business rules: weekend and holiday blocking, period checks, overlap detection, used-days totals, full = 1 and half = 0.5." "TypeScript, src/rules.ts"
                dates = component "dates" "DateKey (yyyy-MM-dd) helpers, Monday-first month arithmetic, range iteration." "TypeScript, src/dates.ts"
                links = component "links" "Deep links to the calendar page with the contractId query parameter." "TypeScript, src/links.ts"
                templateData = component "templateData" "ContractTemplateData: the five optional template columns and demo values." "TypeScript, src/templateData.ts"
                ids = component "IDataService" "The one data access seam: getMyContracts (role-filtered), getEntries, upsertEntry, deleteEntry, getHolidays, getCurrentUser." "TypeScript interface, src/data/IDataService.ts" "Interface"
                local = component "LocalDataService" "In-memory implementation over bundled JSON fixtures (bridge contracts, half days, BG and * holidays, demo users). Used by the workbench, the unit tests and the MCP server in DATA_MODE=local." "TypeScript, src/data/LocalDataService.ts"
                spds = component "SharePointDataService" "PnPjs v4 implementation against the three lists: CAML/OData filters on indexed columns, batched writes, moves an entry that exists on another contract of the same contractor, recomputes OnSiteUsedDays and OffSiteUsedDays." "TypeScript, src/data/SharePointDataService.ts, PnPjs 4"
                spq = component "spQueries / spMappers / listLookup" "OData query builders, SP item to model mappers (CONTRACT_SELECT, CONTRACT_EXPAND), list id resolution by URL and deriveRolesForContracts." "TypeScript, src/data/*.ts"
                tdq = component "templateDataQuery" "getContractTemplateData: reads the five optional template columns of one contract tolerantly." "TypeScript, src/data/templateDataQuery.ts"
            }

            ui = container "shared-ui" "Design tokens and brand, the shared toast stack, the timesheet model and the PDF builders. The PDF code loads in a lazy chunk (orpheus-timesheet-pdf)." "TypeScript library, React 17, pdfmake, html-to-pdfmake 2.5, npm workspace @orpheussystems/shared-ui" "Library" {
                tokens = component "theme tokens and brand" "Orpheus palette (amber #E0A83A, dark #0B0D10), font stack, brand strings and the attribution line." "TypeScript, src/theme, src/brand"
                toast = component "toast" "One toast store and ToastHost shared by every component on the page." "React 17, src/toast"
                tsModel = component "timesheetModel" "Builds the timesheet model from contract, entries and holidays: per-month rows, hours per cell (8.00 / 4.00), totals, remaining." "TypeScript, src/pdf/timesheetModel.ts"
                tsDoc = component "timesheetDocument" "Built-in landscape A4 pdfmake doc definition: header rows, 1 to 31 grid, per-month and grand totals, three signature boxes. Guarded by a golden test." "TypeScript, pdfmake, src/pdf/timesheetDocument.ts"
                tplDoc = component "templateDocument / fillTemplate / templateValues" "HTML template rendering (ADR 0010): fills placeholders, converts with html-to-pdfmake, swaps in the generated grid, totals, header and signature blocks, appends the attribution line." "TypeScript, html-to-pdfmake, src/pdf/*.ts"
                dl = component "downloadPdf" "Creates the PDF with pdfmake in the browser and downloads Timesheet_<ContractCode>_<from>_<to>.pdf." "TypeScript, pdfmake, src/pdf/downloadPdf.ts"
            }

            wp = container "wp-contract-calendar" "The contract calendar web part: contract selector, month grids for the contract period, selection type picker, range drag, stats panel, overlap dialog and the timesheet dialog. Runs on demo data in a debug build." "SPFx web part, React 17, Fluent UI 8, npm workspace @orpheussystems/wp-contract-calendar" "SPFx" {
                wpShell = component "ContractCalendarWebPart" "SPFx entry point and property pane: list pickers filtered by content type, useLocalData, demo user, months to show, weekend blocking, labels, timesheet template path. Reads the contractId query parameter." "SPFx BaseClientSideWebPart, ContractCalendarWebPart.ts"
                createDs = component "createDataService" "Chooses LocalDataService or SharePointDataService once in onInit from the environment and the useLocalData property." "TypeScript, createDataService.ts"
                dataCtx = component "DataContext" "React context that injects the IDataService into the component tree; no component talks to SharePoint directly." "React context, DataContext.tsx"
                calendar = component "ContractCalendar" "Root component: header with contract metadata strip, selection type picker, month grids, stats panel; optimistic updates with rollback." "React, components/ContractCalendar.tsx, useCalendarState.ts"
                grid = component "MonthGrid / DayCell / useRangeDrag" "Monday-first grids, blocked weekends and holidays, click toggles the selected type, drag selects a range." "React, components/MonthGrid.tsx, DayCell.tsx"
                overlap = component "OverlapDialog" "Asks which contract an overlap day counts against before saving." "React, Fluent UI Dialog"
                stats = component "StatsPanel" "Full and half counts, used against target, remaining, warning colour when over." "React, components/StatsPanel.tsx"
                tsDialog = component "TimesheetDialog" "Period defaults to the contract span and can be trimmed; triggers the PDF build." "React, components/TimesheetDialog.tsx"
                tplSource = component "templateSource / templateUrl" "Fetches the HTML template file and its images from the site on every generation with the viewer's permissions; reads the template columns through shared-core." "TypeScript, PnPjs files API"
                filterLists = component "filterListsByContentType" "Property pane list pickers offer only lists carrying the Orpheus content types." "TypeScript"
            }

            appCust = container "ext-app-customizer" "Header and footer on every page: Orpheus mark and wordmark, role-aware menu (My calendar, Contracts, Holidays) that collapses below 640 px, footer with contact and solution version. Menu items and list URLs come from ClientSideComponentProperties written by provisioning." "SPFx application customizer, React 17, npm workspace @orpheussystems/ext-app-customizer" "SPFx"

            fieldCust = container "ext-field-customizer" "Remaining-days bars on the RemainingDays column of the Contracts list: on-site and off-site used against target, amber at 80 percent, red when over. Reads only the row's own columns; no extra query per row." "SPFx field customizer, React 17, npm workspace @orpheussystems/ext-field-customizer" "SPFx"

            formCust = container "ext-form-customizer" "New, Edit and Display forms for the Contracts list: validation as you type, people and date pickers, overlap warning, Open calendar link. Only a site admin or the contract's manager can edit." "SPFx form customizer, React 17, Fluent UI 8, npm workspace @orpheussystems/ext-form-customizer" "SPFx"
        }

        // ------------------------------------------------------------------
        // The Copilot contract agent
        // ------------------------------------------------------------------

        agent = softwareSystem "Contract Calendar agent" "Microsoft 365 Copilot channel to the same calendar. A declarative agent whose only action is a custom MCP server. Contractors book and remove days in natural language, managers and HR read contracts grouped by vendor. Every tool call is audited and runs as the signed-in user." "Agent" {

            da = container "agent-contract-calendar" "Declarative agent package: app manifest 1.30, declarative agent manifest 1.8, instruction.txt and one RemoteMCPServer plugin (manifest 2.4) with dynamic tool discovery and Entra SSO (OAuthPluginVault). The instructions require one confirmation before book_days and remove_days. No code, no build; provisioned by the Agents Toolkit." "Microsoft 365 Agents Toolkit project, JSON manifests" "Manifest"

            mcp = container "mcp-contract-calendar" "MCP server, the agent's action layer. Stateless Streamable HTTP on port 8787: POST /mcp, GET /healthz. Validates the Entra SSO token, exchanges it on behalf of the user for a delegated SharePoint token (AllSites.Write), derives roles including HR, enforces visibility and the contractor-only write rule, writes one JSON audit line per tool call. Reuses shared-core unchanged." "Node 22, TypeScript 5.8, Express 5, MCP TypeScript SDK 1.x, zod, jose 6, msal-node 3, PnPjs 4 with @pnp/nodejs" "Service" {
                httpApp = component "http/app" "Express app: POST /mcp with a per-request StreamableHTTPServerTransport, GET /healthz, 405 on GET and DELETE /mcp, 1 MB JSON limit, refuses to start in AUTH_MODE=entra without the auth middleware, optional one-time redacted header log." "Express 5, src/http/app.ts"
                authMw = component "auth/authMiddleware + verifyToken" "Validates the bearer token with jose (RS256): issuer pinned to the tenant in v1 and v2 forms, audience equal to API_AUDIENCE or CLIENT_ID. Sets the claims on the request or ends it with 401." "jose 6, src/auth/*.ts"
                obo = component "auth/obo" "On-behalf-of exchange with msal-node for SP_SCOPE. A consent or interaction error becomes 401 with WWW-Authenticate: Bearer so Copilot shows the sign-in prompt." "msal-node 3, src/auth/obo.ts"
                ctxFactory = component "context/contextFactory" "Builds the per-request ToolContext: user (oid, upn, SharePoint id), roles, IDataService and contract directory. DATA_MODE=sharepoint creates an SPFI with the OBO token; DATA_MODE=local uses LocalDataService and fixtures." "TypeScript, src/context/*.ts"
                mcpServer = component "mcp/createMcpServer" "Registers the six tools with zod input schemas and MCP annotations (readOnlyHint on the four read tools, destructiveHint false on book_days, true on remove_days). Wraps every call in runTool." "MCP TypeScript SDK, src/mcp/createMcpServer.ts"
                tools = component "tools" "get_my_contracts, list_contracts, get_calendar, get_holidays, book_days, remove_days. Range orchestration (max 31 days per write, max 366 per read), needs_choice on an overlap day, per-day results booked / skipped / failed / removed / notFound, error codes not_found, forbidden, invalid_input, internal." "TypeScript, src/tools/*.ts"
                viewer = component "domain/viewer + applyQuery" "canBook (contractors only), seesAll (HR and Admin), isVisible per contract, vendor and manager filters, grouping by vendor." "TypeScript, src/domain/*.ts"
                directory = component "ContractDirectory" "Read side for the agent: SharePointContractDirectory (OData pre-filter plus in-memory re-check of every item, Vendor column) or InMemoryContractDirectory for fixtures." "TypeScript, src/sharepoint/SharePointContractDirectory.ts, src/domain/InMemoryContractDirectory.ts"
                agentRoles = component "sharepoint/agentRoles + createSpfi" "deriveAgentRoles: the web part's role derivation plus the HR group membership; createSpfi builds the PnPjs instance with the delegated token." "TypeScript, PnPjs 4, @pnp/nodejs"
                audit = component "audit/audit" "runTool: one JSON line per tool call (time, correlationId, serverVersion, user, tool, args, outcome, errorCode, per-day detail with entry ids, tokenId) to stdout or AUDIT_LOG_PATH. No prompt text." "TypeScript, src/audit/audit.ts"
                errLog = component "log/errorLog" "One error line per internal failure with the correlation id; bearer tokens, JWT-shaped strings and cookies redacted." "TypeScript, src/log/errorLog.ts"
                config = component "config" "AUTH_MODE (entra default, none), DATA_MODE (sharepoint default, local), tenant and site values, list URLs, HR_GROUP, AUDIT_LOG_PATH. Rejects none with sharepoint at start-up." "TypeScript, src/config.ts"

                // Proposed in ADR 0018 (not yet committed on public-main when this model was written)
                oversightEndpoint = component "/mcp/oversight endpoint" "PROPOSED (ADR 0018). Second MCP endpoint for the Contract Oversight agent: the four read tools plus reconcile_contract_days, get_contract_health, audit_contract_data and the one write tool save_reconciliation. Never registers book_days or remove_days." "Express route, planned" "Proposed"
                oversightDomain = component "domain: reconcile / health / audit" "PROPOSED (ADR 0018). Pure, unit-tested functions for used days against targets, burn rate, runway, health status and completeness score. Thresholds come from configuration after the business agrees them." "TypeScript, planned" "Proposed"
            }

            auditSink = container "Audit sink" "Where the per-tool-call JSON lines land: stdout of the mcp compose service or the file in AUDIT_LOG_PATH during the demo; a dedicated Log Analytics table in the Azure target (ADR 0014, ADR 0016)." "JSON lines; Log Analytics in the target" "Data store"

            oversightDa = container "agent-contract-oversight" "PROPOSED (ADR 0018). Second declarative agent for contract managers, HR and site admins: reconciliation of booked days against the contract, contract health check and contract data audit, adapted from three MIT-licensed PnP sharepoint-skills. Two package flavours: manifest 1.9 with agent_skills (Frontier preview) and manifest 1.8 plain. Never touches calendar entries." "Microsoft 365 Agents Toolkit project, planned" "Manifest,Proposed"
        }

        // ------------------------------------------------------------------
        // Provisioning (PnP PowerShell on the host)
        // ------------------------------------------------------------------

        provisioning = softwareSystem "Provisioning scripts" "PnP PowerShell 3 on PowerShell 7.4, run from the host, idempotent with -WhatIf, tested with Pester against faked cmdlets. No Node needed." "Scripts" {
            provisionSite = container "Provision-OrpheusSite.ps1" "Wraps a PnP site template (template.xml): content types, the three lists with indexes, RemainingDays bound to the field customizer, the Orpheus Contract content type bound to the form customizer, the ContractCalendar.aspx page with the web part and lists preselected, starter holidays for -Country, application customizer registration with its properties." "PnP PowerShell 3, infra/provisioning" "Script"
            addTemplateCols = container "Add-TimesheetTemplateColumns.ps1" "Adds the five optional template columns (ConsultantPosition, Vendor, Lot, ApproverName, TemplateFields); -SeedDemoData fills the demo contract (ADR 0010)." "PnP PowerShell 3, infra/provisioning" "Script"
            setupAgent = container "Setup-AgentDemo.ps1" "Agent demo setup: Vendor column with the same fixed id as the template script, the HR SharePoint group with Read, 002xxx demo contracts and entries, recomputed used days (ADR 0013). UPNs are parameters, never committed." "PnP PowerShell 3, packages/mcp-contract-calendar/setup" "Script"
        }

        // ------------------------------------------------------------------
        // External systems
        // ------------------------------------------------------------------

        spo = softwareSystem "SharePoint Online" "The Microsoft 365 site that hosts the lists, the calendar page, the optional timesheet template and the site collection App Catalog. Authentication and audit are SharePoint's own." "External" {
            contracts = container "Contracts list" "Orpheus Contract content type. Code, framework contract, modality, contractor, manager, period, on-site and off-site targets, hours per day, country, status, used days kept by the service, RemainingDays (field customizer target), optional template columns and Vendor. Site-default permissions: contractors hold Contribute (ADR 0005)." "SharePoint list" "External,Data store"
            entries = container "CalendarEntries list" "One item per contractor per date across all their contracts (ADR 0008): lookup to the contract, EntryDate (indexed), EntryType (OnSiteFull, OnSiteHalf, OffSiteFull, OffSiteHalf), optional note." "SharePoint list" "External,Data store"
            holidays = container "Holidays list" "Public holidays per country (ISO alpha-2 or * for all), Source Manual or Agent (reserved for the future holiday agent)." "SharePoint list" "External,Data store"
            page = container "ContractCalendar.aspx" "Modern page created by provisioning that hosts the web part with the three lists preselected; honours the contractId query parameter. Also the place for a Button or Quick links web part that opens the agent's share link (ADR 0017)." "SharePoint modern page" "External"
            template = container "Timesheet HTML template" "Optional .html file uploaded by a site owner to a library only owners can edit; the web part property points at it (ADR 0010). Read with the viewer's permissions on every generation." "File in a document library" "External,Data store"
            appCatalog = container "Site collection App Catalog" "Where the four .sppkg solutions are installed from." "SharePoint App Catalog" "External"
            spGroups = container "Site groups" "Owners group (admin role) and the HR group named by HR_GROUP (agent-only HR role)." "SharePoint groups" "External"
        }

        copilot = softwareSystem "Microsoft 365 Copilot Chat" "Hosts the declarative agent in Copilot Chat or Teams. Calls the MCP plugin from Microsoft's cloud over the public internet with an Entra SSO token. Works for unlicensed users through the share link (ADR 0017)." "External"
        entra = softwareSystem "Microsoft Entra ID" "Issues the SSO token for the server's Application ID URI and performs the on-behalf-of exchange for a delegated SharePoint token. The server has its own app registration, separate from the provisioning one." "External"
        purview = softwareSystem "Microsoft Purview Audit" "Records CopilotInteraction events (layer 1) and SharePoint ListItemCreated / Updated / Deleted events with the real user as actor (layer 2). Joined with the server's audit line on user and time (ADR 0014)." "External"
        tunnel = softwareSystem "Microsoft dev tunnel relay" "Persistent tunnel with a stable host name, anonymous at the relay because Copilot cannot sign in to it. Demo only, no SLA (ADR 0015)." "External,Demo"
        pnpSkills = softwareSystem "PnP sharepoint-skills catalog" "PROPOSED (ADR 0018). Source of the three MIT-licensed skills (invoice-po-reconciliation, project-health-check, metadata-completeness-auditor) that the oversight agent adapts with attribution." "External,Proposed"
        graphStore = softwareSystem "Graph store (GraphRAG)" "PROPOSED, LATER (ADR 0018). Only if questions need three or more hops across documents and relations. Neo4j by default, PostgreSQL + AGE only if PostgreSQL enters the stack, Cosmos DB for Gremlin excluded. Needs its own ADR." "External,Proposed"

        // ------------------------------------------------------------------
        // Relationships: people
        // ------------------------------------------------------------------

        contractor -> suite.wp "Marks on-site and off-site days, resolves overlap days, generates the timesheet" "Browser"
        contractor -> suite.appCust "Sees the header menu (My calendar)" "Browser"
        contractor -> copilot "Asks the Contract Calendar agent to book, remove and list days" "Copilot Chat or Teams"
        contractor -> approver "Hands over the signed timesheet PDF" "Offline"

        manager -> suite.wp "Watches used and remaining days read-only, generates the timesheet" "Browser"
        manager -> suite.formCust "Creates and edits the contracts they manage" "Browser"
        manager -> suite.fieldCust "Reads the remaining-days bars in the Contracts list views" "Browser"
        manager -> suite.appCust "Sees the header menu (Contracts)" "Browser"
        manager -> copilot "Asks the agent for contracts grouped by vendor (read only)" "Copilot Chat or Teams"

        admin -> suite.formCust "Edits any contract" "Browser"
        admin -> suite.wp "Configures the web part: lists, labels, template path" "Browser, property pane"
        admin -> spo.holidays "Maintains holidays in the standard list UI" "Browser"
        admin -> spo.template "Uploads and edits the timesheet HTML template" "Browser"
        admin -> spo.appCatalog "Installs the four .sppkg solutions" "Browser"
        admin -> provisioning "Runs the provisioning scripts" "PowerShell 7.4"

        hr -> copilot "Asks the agent for all contracts grouped by vendor (read only)" "Copilot Chat or Teams"

        developer -> suite "Builds, tests and packages in the Podman container" "podman compose, scripts/podman.ps1"
        developer -> agent.mcp "Runs the mcp compose service and hosts the dev tunnel for the demo" "podman compose, devtunnel CLI"
        developer -> agent.da "Provisions and sideloads the agent package" "Microsoft 365 Agents Toolkit"
        developer -> provisioning "Runs the scripts against the dev tenant" "PowerShell 7.4"

        // ------------------------------------------------------------------
        // Relationships: inside the suite
        // ------------------------------------------------------------------

        suite.wp.wpShell -> suite.wp.createDs "Selects the data service once in onInit"
        suite.wp.createDs -> suite.core.local "Creates when the environment is Local or useLocalData is on"
        suite.wp.createDs -> suite.core.spds "Creates otherwise, with the lists chosen in the property pane"
        suite.wp.wpShell -> suite.wp.dataCtx "Provides the service to the React tree"
        suite.wp.wpShell -> suite.wp.filterLists "Filters the list pickers by content type"
        suite.wp.wpShell -> suite.wp.calendar "Renders"
        suite.wp.calendar -> suite.wp.dataCtx "Reads and writes through IDataService"
        suite.wp.dataCtx -> suite.core.ids "Exposes"
        suite.wp.calendar -> suite.wp.grid "Renders the month grids"
        suite.wp.calendar -> suite.wp.stats "Renders"
        suite.wp.calendar -> suite.wp.overlap "Opens on an overlap day"
        suite.wp -> contractor "Shows the overlap dialog, stats and toasts" "Browser"
        suite.ui -> manager "Downloads the generated timesheet PDF" "Browser"
        suite.wp.calendar -> suite.wp.tsDialog "Opens on Generate timesheet"
        suite.wp.calendar -> suite.core.rules "Applies blocking, toggle and totals rules"
        suite.wp.calendar -> suite.core.dates "Date arithmetic"
        suite.wp.tsDialog -> suite.ui.tsModel "Builds the timesheet model"
        suite.wp.tsDialog -> suite.ui.dl "Downloads the PDF"
        suite.wp.tsDialog -> suite.wp.tplSource "Loads the template and its data when a path is set"
        suite.wp.tplSource -> spo.template "Fetches the HTML file and images with the viewer's permissions, no cache" "PnPjs files API"
        suite.wp.tplSource -> suite.core.tdq "Reads the template columns of the contract"
        suite.wp.tplSource -> suite.ui.tplDoc "Hands the filled template to the renderer"
        suite.wp.calendar -> suite.ui.toast "Reports results and errors"
        suite.wp.calendar -> suite.ui.tokens "Theme"

        suite.ui.dl -> suite.ui.tsDoc "Built-in layout when no template is set"
        suite.ui.dl -> suite.ui.tplDoc "Template layout when a path is set"
        suite.ui.tplDoc -> suite.ui.tsDoc "Reuses the block builders for grid, totals, header and signatures"
        suite.ui.tsModel -> suite.core.rules "Totals and hours per day"
        suite.ui.tsModel -> suite.core.models "Types"

        suite.core.local -> suite.core.ids "Implements"
        suite.core.spds -> suite.core.ids "Implements"
        suite.core.spds -> suite.core.spq "Queries and mappers"
        suite.core.spds -> suite.core.rules "Enforces one entry per contractor per date, blocked days, used-days recomputation"
        suite.core.spds -> spo.contracts "Reads role-filtered contracts, updates used days" "PnPjs 4 REST, OData on indexed columns"
        suite.core.spds -> spo.entries "Reads entries by contract and period, upserts and deletes, moves an entry between contracts" "PnPjs 4 REST, batched writes"
        suite.core.spds -> spo.holidays "Reads holidays for the contract's country and *" "PnPjs 4 REST"
        suite.core.spq -> spo.spGroups "Checks Owners group membership for the admin role" "PnPjs 4 REST"
        suite.core.tdq -> spo.contracts "Reads one contract's template columns tolerantly" "PnPjs 4 REST"

        suite.appCust -> suite.core "Role derivation (deriveRolesForContracts, resolveListIdByUrl), menu link helpers" "TypeScript import"
        suite.appCust -> suite.ui "Theme tokens, brand, toasts" "TypeScript import"
        suite.appCust -> spo.contracts "Reads the user's contracts to derive roles; fails open to a role-less menu" "PnPjs 4 REST"
        suite.appCust -> spo.spGroups "Checks Owners group membership" "PnPjs 4 REST"
        suite.appCust -> spo.page "Links to the calendar page"

        suite.fieldCust -> suite.ui "Theme tokens" "TypeScript import"
        suite.fieldCust -> spo.contracts "Renders RemainingDays from the row's own target and used columns; no extra query" "SPFx field customizer binding"

        suite.formCust -> suite.core "Models, mappers, overlap query, deriveRolesForContracts (fails closed)" "TypeScript import"
        suite.formCust -> suite.ui "Theme tokens, toasts" "TypeScript import"
        suite.formCust -> spo.contracts "Loads, validates and saves contracts; queries overlapping contracts of the same contractor" "PnPjs 4 REST"
        suite.formCust -> spo.spGroups "Checks Owners group membership" "PnPjs 4 REST"
        suite.formCust -> spo.page "Open calendar link with contractId"

        // ------------------------------------------------------------------
        // Relationships: the agent
        // ------------------------------------------------------------------

        copilot -> agent.da "Runs the declarative agent; reads tools and schemas from the server at runtime (dynamic discovery)"
        agent.da -> agent.mcp.httpApp "MCP over HTTPS, stateless Streamable HTTP POST /mcp, Entra SSO bearer token" "HTTPS, JSON-RPC"
        copilot -> entra "Obtains the SSO token for the server's Application ID URI" "OAuth 2.0"
        copilot -> purview "CopilotInteraction record per prompt (layer 1, automatic)"
        spo -> purview "ListItem* records with the real user as actor (layer 2, automatic)"
        spo.entries -> purview "ListItemCreated / Updated / Deleted / Recycled with the real user as actor (layer 2, automatic)"
        spo.contracts -> purview "ListItemUpdated for used-days and reconciliation writes (layer 2, automatic)"

        agent.mcp.httpApp -> agent.mcp.authMw "Runs before POST /mcp in AUTH_MODE=entra"
        agent.mcp.authMw -> entra "Fetches signing keys (JWKS) and validates issuer and audience" "HTTPS"
        agent.mcp.httpApp -> agent.mcp.ctxFactory "Builds the per-request context"
        agent.mcp.ctxFactory -> agent.mcp.obo "Exchanges the SSO token"
        agent.mcp.obo -> entra "On-behalf-of exchange for a delegated SharePoint token (AllSites.Write)" "OAuth 2.0 OBO"
        agent.mcp.ctxFactory -> agent.mcp.agentRoles "Derives roles including HR; builds the SPFI"
        agent.mcp.agentRoles -> suite.core.spq "Reuses deriveRolesForContracts" "TypeScript import"
        agent.mcp.agentRoles -> spo.spGroups "Checks the HR group and Owners group" "PnPjs 4 REST as the user"
        agent.mcp.ctxFactory -> suite.core.spds "Creates per request with the OBO token (DATA_MODE=sharepoint)" "TypeScript import"
        agent.mcp.ctxFactory -> suite.core.local "Uses fixtures in DATA_MODE=local and in tests" "TypeScript import"
        agent.mcp.ctxFactory -> agent.mcp.directory "Creates the contract directory"
        agent.mcp.ctxFactory -> agent.mcp.config "Reads"
        agent.mcp.httpApp -> agent.mcp.mcpServer "Creates a server and transport per request"
        agent.mcp.mcpServer -> agent.mcp.tools "Dispatches tool calls"
        agent.mcp.mcpServer -> agent.mcp.audit "Wraps every call in runTool"
        agent.mcp.mcpServer -> agent.mcp.errLog "Logs internal errors with the correlation id"
        agent.mcp.tools -> agent.mcp.viewer "Visibility and write permission checks"
        agent.mcp.tools -> agent.mcp.directory "Reads contracts with vendor for list_contracts and get_my_contracts"
        agent.mcp.tools -> suite.core.ids "book_days and remove_days go through upsertEntry and deleteEntry; get_calendar and get_holidays through the reads" "TypeScript import"
        agent.mcp.tools -> suite.core.rules "Business days, blocked days, overlap detection" "TypeScript import"
        agent.mcp.directory -> spo.contracts "OData pre-filter plus in-memory re-check of every item; Vendor column" "PnPjs 4 REST as the user"
        agent.mcp.audit -> agent.auditSink "Appends one JSON line per tool call"
        agent.mcp.oversightEndpoint -> agent.mcp.oversightDomain "PROPOSED: calls the pure functions"
        agent.mcp.oversightEndpoint -> agent.mcp.authMw "PROPOSED: same token validation"
        agent.mcp.oversightEndpoint -> agent.mcp.audit "PROPOSED: same audit"
        agent.mcp.oversightDomain -> spo.contracts "PROPOSED: save_reconciliation writes ReconciliationStatus, Details, ReconciledAt, ReconciledBy as the user" "PnPjs 4 REST as the user"

        agent.oversightDa -> agent.mcp "PROPOSED (ADR 0018): MCP over HTTPS to /mcp/oversight, Entra SSO" "HTTPS, JSON-RPC"
        copilot -> agent.oversightDa "PROPOSED (ADR 0018): runs the oversight agent"
        pnpSkills -> agent.oversightDa "PROPOSED: three skills adapted with attribution"
        agent.mcp -> graphStore "PROPOSED, LATER: GraphRAG only when the trigger in ADR 0018 is met"
        manager -> agent.oversightDa "PROPOSED: asks for reconciliation, health and data audit; may save a reconciliation"
        hr -> agent.oversightDa "PROPOSED: reads reconciliation, health and data audit"

        // ------------------------------------------------------------------
        // Relationships: provisioning
        // ------------------------------------------------------------------

        provisioning.provisionSite -> spo.contracts "Creates content type, list, indexes, RemainingDays with the field customizer binding, Orpheus Contract bound to the form customizer" "PnP PowerShell, Invoke-PnPSiteTemplate"
        provisioning.provisionSite -> spo.entries "Creates with indexes" "PnP PowerShell"
        provisioning.provisionSite -> spo.holidays "Creates and seeds starter holidays for -Country" "PnP PowerShell"
        provisioning.provisionSite -> spo.page "Creates ContractCalendar.aspx with the web part and lists preselected" "PnP PowerShell"
        provisioning.provisionSite -> suite.appCust "Registers the application customizer with menu, list and page URLs in ClientSideComponentProperties" "PnP PowerShell, custom action"
        provisioning.provisionSite -> spo.appCatalog "Needs the solutions installed first: binds by component id" "Dependency"
        provisioning.addTemplateCols -> spo.contracts "Adds the five optional template columns; -SeedDemoData" "PnP PowerShell"
        provisioning.setupAgent -> spo.contracts "Adds Vendor (same fixed id), 002xxx demo contracts, recomputes used days" "PnP PowerShell"
        provisioning.setupAgent -> spo.entries "Seeds demo entries" "PnP PowerShell"
        provisioning.setupAgent -> spo.spGroups "Creates the HR group with Read and adds the HR member" "PnP PowerShell"

        // ------------------------------------------------------------------
        // Deployment environments
        // ------------------------------------------------------------------

        prod = deploymentEnvironment "SharePoint site" {
            deploymentNode "User's browser" "Runs the SPFx bundles on SharePoint Online pages; generates and downloads the PDF." "Edge, Chrome" {
                containerInstance suite.wp
                containerInstance suite.appCust
                containerInstance suite.fieldCust
                containerInstance suite.formCust
                containerInstance suite.core
                containerInstance suite.ui
            }
            deploymentNode "Microsoft 365" {
                deploymentNode "SharePoint Online site" "One site hosts all three lists, the page and the App Catalog." {
                    softwareSystemInstance spo
                }
                softwareSystemInstance purview
            }
            deploymentNode "Administrator's host" "Windows 11; no Node needed." "PowerShell 7.4, PnP PowerShell 3" {
                softwareSystemInstance provisioning
            }
        }

        demo = deploymentEnvironment "Agent demo (dev tunnel)" {
            deploymentNode "Microsoft cloud" {
                deploymentNode "Microsoft 365 Copilot" {
                    softwareSystemInstance copilot
                    containerInstance agent.da
                }
                softwareSystemInstance entra
                deploymentNode "SharePoint Online (dev tenant site)" {
                    softwareSystemInstance spo
                }
                softwareSystemInstance purview
                softwareSystemInstance tunnel
            }
            deploymentNode "Developer host" "Windows 11, Podman 6.1.4, no Node on the host." "Windows 11" {
                infrastructureNode "devtunnel host" "Forwards the persistent tunnel to localhost:8787. Runs on the host OS, stopped when not demoing." "devtunnel CLI"
                deploymentNode "Podman machine" "WSL VM; Node memory capped at 1536 MB for the server." "WSL 2" {
                    deploymentNode "compose project orpheus-agent, service mcp" "Separate compose project name so it does not clash with the SPFx services. AUTH_MODE=entra, DATA_MODE=sharepoint; .env is gitignored." "docker.io/m365pnp/spfx:1.23.2, Node 22" {
                        containerInstance agent.mcp
                        containerInstance agent.auditSink
                    }
                }
                deploymentNode "PowerShell 7.4" {
                    containerInstance provisioning.setupAgent
                }
            }
        }

        azure = deploymentEnvironment "Agent Azure target (Proposed, ADR 0016)" {
            deploymentNode "Microsoft cloud" {
                deploymentNode "Microsoft 365 Copilot" {
                    softwareSystemInstance copilot
                    containerInstance agent.da
                }
                softwareSystemInstance entra
                deploymentNode "SharePoint Online (client tenant)" {
                    softwareSystemInstance spo
                }
                softwareSystemInstance purview
            }
            sub = deploymentNode "Azure subscription" "Provisioned with Terraform, one state per client environment. Nothing of it is built yet." "Terraform" "Proposed" {
                apim = infrastructureNode "API Management" "Only public entry. validate-jwt on issuer and audience, per-user rate limit keyed on oid. Defence in depth; the server still validates." "Azure API Management" "Proposed"
                cae = deploymentNode "Container Apps environment" "" "Azure Container Apps" "Proposed" {
                    aca = deploymentNode "Container App: mcp-contract-calendar" "minReplicas 1, so no cold start inside the roughly 10 second action timeout; ingress allows only API Management. Same build output and variables as the local run." "Node 22 slim image (Dockerfile still to write)" "Proposed" {
                        containerInstance agent.mcp
                    }
                }
                acr = infrastructureNode "Container Registry" "Image pulled with the managed identity." "Azure Container Registry" "Proposed"
                kv = infrastructureNode "Key Vault" "OBO client secret or, preferably, a certificate. No secret in app settings." "Azure Key Vault" "Proposed"
                la = deploymentNode "Log Analytics workspace" "Container logs, gateway logs and a dedicated audit table with its own retention." "Azure Monitor Logs" "Proposed" {
                    containerInstance agent.auditSink
                }
            }
            azure.sub.apim -> azure.sub.cae.aca "Forwards /mcp after validate-jwt and rate limiting" "HTTPS"
            azure.sub.cae.aca -> azure.sub.kv "Reads the OBO credential with the managed identity" "HTTPS"
            azure.sub.acr -> azure.sub.cae.aca "Image pull with the managed identity" "HTTPS"
            azure.sub.apim -> azure.sub.la "Gateway logs" "Diagnostics"
        }
    }

    // ----------------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------------

    views {

        systemLandscape "Landscape" "Everything: the SPFx suite, the Copilot agent, provisioning, SharePoint Online and the Microsoft services around them. Proposed elements (ADR 0016, ADR 0018) are dashed." {
            include *
            autolayout lr
        }

        systemContext suite "SuiteContext" "System context of the SPFx suite (TOGAF Phase A, section 5)." {
            include *
            autolayout lr
        }

        systemContext agent "AgentContext" "System context of the Contract Calendar agent and the proposed oversight agent (ADR 0011 to ADR 0018)." {
            include *
            autolayout lr
        }

        container suite "SuiteContainers" "The web part, the three extensions, the two shared libraries and the SharePoint lists they read and write (TOGAF Phase C, application architecture section 3)." {
            include *
            include spo.contracts spo.entries spo.holidays spo.page spo.template spo.spGroups
            exclude spo
            autolayout lr
        }

        container agent "AgentContainers" "Declarative agent, MCP server, audit sink, and the proposed oversight agent on the same server." {
            include *
            include suite.core
            include spo.contracts spo.entries spo.holidays spo.spGroups
            exclude spo
            autolayout lr
        }

        container spo "SharePointSite" "What the provisioning scripts create on the site and who reads or writes each list." {
            include *
            autolayout lr
        }

        component suite.core "SharedCoreComponents" "shared-core: the IDataService seam, its two implementations and the rules every channel shares (ADR 0003, ADR 0008)." {
            include *
            autolayout lr
        }

        component suite.ui "SharedUiComponents" "shared-ui: tokens, toasts and the two PDF paths (ADR 0004, ADR 0010)." {
            include *
            autolayout lr
        }

        component suite.wp "WebPartComponents" "wp-contract-calendar: web part shell, data context and the calendar components." {
            include *
            autolayout lr
        }

        component agent.mcp "McpServerComponents" "mcp-contract-calendar: request pipeline from token validation to audited tool calls (ADR 0011, ADR 0012, ADR 0014). Proposed oversight parts dashed (ADR 0018)." {
            include *
            autolayout lr
        }

        dynamic suite "MarkADay" "Business process 4.1, mark a day: the contractor clicks a day inside an overlap window (TOGAF Phase B, ADR 0008)." {
            contractor -> suite.wp "Clicks a day with the selection type on-site full"
            suite.wp -> suite.core "Weekend or holiday? Already holds the same type? Inside an overlap window?"
            suite.wp -> contractor "Overlap dialog: count against which contract?"
            suite.wp -> suite.core "upsertEntry(entry) through IDataService, optimistic UI with rollback"
            suite.core -> spo.entries "Deletes any entry on that date on the contractor's other contracts, adds the new one (batched)"
            suite.core -> spo.contracts "Recomputes OnSiteUsedDays / OffSiteUsedDays on every affected contract"
            suite.wp -> contractor "Stats panel refreshes: used, remaining, warning colour"
            autolayout lr
        }

        dynamic suite "GenerateTimesheet" "Business process 4.3, generate the timesheet with an HTML template set (ADR 0004, ADR 0010)." {
            manager -> suite.wp "Presses Generate timesheet; the period defaults to the contract span"
            suite.wp -> suite.core "Entries, holidays and the five template columns of the contract"
            suite.wp -> spo.template "Fetches the HTML file and images with the viewer's permissions, no cache"
            suite.wp -> suite.ui "Timesheet model, then the template renderer: placeholders filled, html-to-pdfmake, generated grid, totals, header and signatures swapped in, attribution appended"
            suite.ui -> manager "Downloads Timesheet_<ContractCode>_<from>_<to>.pdf, or shows the error list and downloads nothing if the template is broken"
            autolayout lr
        }

        dynamic agent.mcp "BookDaysViaAgent" "A contractor books days in Copilot Chat: SSO, on-behalf-of, shared rules, three audit layers (ADR 0012, ADR 0014)." {
            contractor -> copilot "Book me on-site days from 1 to 5 December"
            copilot -> agent.da "Runs the agent; the instructions restate dates, type and contract and ask for one confirmation"
            copilot -> entra "SSO token for the server's Application ID URI"
            agent.da -> agent.mcp.httpApp "POST /mcp tools/call book_days, bearer token"
            agent.mcp.httpApp -> agent.mcp.authMw "Validates issuer and audience (jose)"
            agent.mcp.httpApp -> agent.mcp.ctxFactory "Builds the request context"
            agent.mcp.ctxFactory -> agent.mcp.obo "On-behalf-of exchange"
            agent.mcp.obo -> entra "Delegated SharePoint token, AllSites.Write"
            agent.mcp.ctxFactory -> agent.mcp.agentRoles "Roles: contractor, manager, HR, admin"
            agent.mcp.httpApp -> agent.mcp.mcpServer "Dispatches the call"
            agent.mcp.mcpServer -> agent.mcp.tools "book_days(from, to, type, contractId?)"
            agent.mcp.tools -> agent.mcp.viewer "canBook and isVisible; forbidden for anyone but the contract's contractor"
            agent.mcp.tools -> suite.core "upsertEntry per business day; weekends, holidays and days outside the contract skipped; needs_choice on an unresolved overlap day"
            suite.core -> spo.entries "Writes as the user (OBO)"
            spo.entries -> purview "ListItemCreated with the real user as actor (layer 2)"
            agent.mcp.mcpServer -> agent.mcp.audit "runTool: one JSON line with booked[].entryId, skipped, failed (layer 3)"
            agent.mcp.audit -> agent.auditSink "Appends"
            copilot -> purview "CopilotInteraction record (layer 1)"
            autolayout lr
        }

        deployment * prod "ProductionSite" "Where the SPFx suite runs: the browser on a SharePoint Online page, the site, and the administrator's host for provisioning (TOGAF Phase D, section 3.1)." {
            include *
            autolayout lr
        }

        deployment * demo "AgentDemo" "The agent demo: Podman service mcp behind a persistent dev tunnel on the developer host; nothing in Azure (ADR 0015, Phase D section 3.2)." {
            include *
            autolayout lr
        }

        deployment * azure "AgentAzureTarget" "PROPOSED, not built: API Management in front of Container Apps, Key Vault, Log Analytics audit table, Terraform (ADR 0016, roadmap RM-4)." {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
                background #0B0D10
                color #ffffff
            }
            element "Software System" {
                shape roundedbox
                background #262626
                color #ffffff
            }
            element "Suite" {
                background #E0A83A
                color #0B0D10
            }
            element "Agent" {
                background #9DC3E6
                color #0B0D10
            }
            element "Scripts" {
                background #E8DB9C
                color #0B0D10
            }
            element "External" {
                background #7F7F7F
                color #ffffff
            }
            element "Container" {
                shape roundedbox
                background #4D4D4D
                color #ffffff
            }
            element "Library" {
                shape folder
                background #5C5C5C
            }
            element "SPFx" {
                background #B8862E
                color #0B0D10
            }
            element "Service" {
                shape hexagon
                background #2F6FA3
            }
            element "Manifest" {
                background #5A8FBF
            }
            element "Script" {
                background #B5A74A
                color #0B0D10
            }
            element "Component" {
                background #6B6B6B
                color #ffffff
            }
            element "Interface" {
                shape ellipse
            }
            element "Data store" {
                shape cylinder
            }
            element "Proposed" {
                border dashed
                opacity 60
            }
            element "Demo" {
                border dotted
            }
        }
    }
}
