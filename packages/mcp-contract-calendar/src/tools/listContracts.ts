import type { UserRef } from '@orpheussystems/shared-core';
import type { ToolContext } from '../domain/types';
import { seesAll } from '../domain/viewer';
import { ToolError } from './dateRange';
import { toSummary } from './getMyContracts';
import type { ContractSummary } from './getMyContracts';

export type ListContractsResult =
  | { status: 'ok'; vendors: Array<{ vendor: string; contracts: ContractSummary[] }>; note?: string }
  | { status: 'needs_choice'; question: string; candidates: Array<{ id: number; name: string; email: string }> };

const lc = (s: string): string => s.trim().toLowerCase();

function matches(m: UserRef, q: string): boolean {
  return lc(m.email) === q || lc(m.displayName) === q || lc(m.displayName).split(/\s+/).includes(q);
}

export async function listContracts(
  ctx: ToolContext,
  args: { vendor?: string; manager?: string; includeClosed?: boolean }
): Promise<ListContractsResult> {
  const { viewer, directory } = ctx;
  if (!seesAll(viewer) && !viewer.roles.includes('ContractManager')) {
    throw new ToolError('forbidden', 'Listing contracts is for contract managers and HR; use get_my_contracts.');
  }

  let managerId: number | undefined;
  if (args.manager !== undefined && args.manager.trim() !== '') {
    const q = lc(args.manager);
    const found = (await directory.managersVisibleTo(viewer)).filter(m => matches(m, q));
    if (found.length === 0) {
      return {
        status: 'ok',
        vendors: [],
        note: `No manager named "${args.manager}" among the contracts you can see.`
      };
    }
    if (found.length > 1) {
      return {
        status: 'needs_choice',
        question: `Several managers match "${args.manager}". Which one do you mean?`,
        candidates: found.map(m => ({ id: m.id, name: m.displayName, email: m.email }))
      };
    }
    managerId = found[0].id;
  }

  const list = await directory.listVisible(viewer, {
    vendor: args.vendor,
    managerId,
    includeClosed: args.includeClosed
  });
  const groups = new Map<string, ContractSummary[]>();
  for (const c of list) {
    const key = c.vendor ?? '(no vendor)';
    const g = groups.get(key);
    if (g) g.push(toSummary(c));
    else groups.set(key, [toSummary(c)]);
  }
  return { status: 'ok', vendors: [...groups].map(([vendor, contracts]) => ({ vendor, contracts })) };
}
