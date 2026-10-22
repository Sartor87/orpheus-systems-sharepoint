# Contract agent prompt set

Prompts for the live demo and for regression after changes to tools, descriptions or
`instruction.txt`. Run them in order per user; prompts 2 and 5 depend on earlier ones. Demo data
and users are described in `demo-procedure.md`.

Dates assume the demo runs in late October or early November 2026 (2026-11-16 is a Monday). The
agent resolves dd.mm to the nearest occurrence inside one of the user's active contracts and states
the ISO dates back before it books. Contract ids in arguments are SharePoint item ids; the agent
takes them from `get_my_contracts`, shown here as `<id 002103_2027>`.

Without a Copilot licence there is no developer-mode debug card, so check the expected tool call in
the server's audit lines (`tool`, `args`, `outcome`, `detail`) and the list contents.

| # | User | Prompt | Expected tool and arguments | Expected outcome | Live result |
|---|---|---|---|---|---|
| 1 | Alex | book me on-site 17.11 to 20.11 | Agent restates 2026-11-17 to 2026-11-20, OnSiteFull, and asks for confirmation. After "yes": `book_days {from: "2026-11-17", to: "2026-11-20", type: "OnSiteFull"}` | `needs_choice`: the dates fall in `002102_2026` and `002103_2027` (both Kuker Consulting). Nothing is written. The agent asks which contract and waits; it does not pick one. Audit `outcome: needs_choice`. | |
| 2 | Alex | count them against 002103_2027 | `book_days {from: "2026-11-17", to: "2026-11-20", type: "OnSiteFull", contractId: <id 002103_2027>}` | 4 booked on `002103_2027`, nothing skipped or failed. Totals of `002103_2027` updated. Agent reports the four dates. | |
| 3 | Alex | half day off-site next Friday | Agent resolves "next Friday" to an ISO date and states it. `book_days {from: <friday>, to: <friday>, type: "OffSiteHalf"}` | Before 2026-11-16 only `002102_2026` covers the date: 1 booked as OffSiteHalf. If the Friday falls between 2026-11-16 and 2026-11-27: `needs_choice` as in prompt 1. | |
| 4 | Ivan | how many on-site days are left on 002101_2026 | `get_my_contracts {}` (or `get_calendar {contractId: <id 002101_2026>, ...}`) | Remaining on-site days of `002101_2026` read from the tool result (target 120 minus used), no arithmetic by the model. Ivan manages the contract, so it is visible. | |
| 5 | Alex | remove the 18th | Agent resolves to 2026-11-18 on `002103_2027` from the conversation (asks if unclear), restates the date and contract and asks for confirmation. After "yes": `remove_days {from: "2026-11-18", to: "2026-11-18", contractId: <id 002103_2027>}` | `removed: [{date: "2026-11-18", entryId: <item id>}]`, `notFound: []`. Totals updated. | |
| 6 | Alex | book me on-site 24.12 to 28.12 | `book_days {from: "2026-12-24", to: "2026-12-28", type: "OnSiteFull"}` | Only `002103_2027` covers December, so no choice is needed. Booked: 2026-12-28. Skipped: 2026-12-24 and 2026-12-25 (`holiday`, BG Christmas Eve and Christmas Day), 2026-12-26 and 2026-12-27 (`weekend`). Agent lists every skipped day with its reason. | |
| 7 | Ivan | show my vendors' contracts | `list_contracts {}` | 4 contracts in 3 vendor groups: Kuker Consulting (`002102_2026`, `002103_2027`), Samodiva Systems (`002101_2026`), Sofia SharePoint Chads (`002104_2026`), with used and remaining days. No 001xxx contracts unless Ivan manages them. | |
| 8 | Emilia | show me the contracts for Ivan's vendors | `list_contracts {manager: "Ivan"}` | Same 4 contracts grouped by the same 3 vendors. If more than one site user matches "Ivan", `needs_choice` with the candidates; the agent asks which person. | |
| 9 | Emilia | book me Monday | None expected; the instructions say HR is read-only. If the model calls `book_days` anyway, the server returns `forbidden` ("Only contractors can book days."). | Polite refusal, nothing written. If a tool was called, audit `outcome: error`, `errorCode: forbidden`. | |
| 10 | Ivan | book Alex on Monday | None expected; managers are read-only and nobody books for someone else. If called, `book_days` returns `forbidden`. | Polite refusal, nothing written. | |
| 11 | Alex | how many on-site days are left on 002101_2026 | `get_my_contracts {}`; possibly `get_calendar {contractId: ...}` | `002101_2026` is Ionna's contract and not visible to Alex: not in the list, or `not_found` from `get_calendar`. The agent says it cannot find that contract, without details about it. | |
| 12 | Alex | which contracts do I have and how many days are left? | `get_my_contracts {}` | `002102_2026` and `002103_2027` with vendor, period, used and remaining days; roles `Contractor`. (Conversation starter.) | |
