import type { ContractStatus, DateKey } from '@orpheussystems/shared-core';
import type { AgentRole, ToolContext, VendorContract } from '../domain/types';

export interface ContractSummary {
  id: number;
  title: string;
  contractCode: string;
  vendor: string | null;
  contractor: string;
  manager: string;
  startDate: DateKey;
  latestExecutionDate: DateKey;
  status: ContractStatus;
  onSiteTargetDays: number;
  offSiteTargetDays: number;
  onSiteUsedDays: number;
  offSiteUsedDays: number;
  onSiteRemaining: number;
  offSiteRemaining: number;
}

export function toSummary(c: VendorContract): ContractSummary {
  return {
    id: c.id,
    title: c.title,
    contractCode: c.contractCode,
    vendor: c.vendor,
    contractor: c.contractor.displayName,
    manager: c.contractManager.displayName,
    startDate: c.startDate,
    latestExecutionDate: c.latestExecutionDate,
    status: c.status,
    onSiteTargetDays: c.onSiteTargetDays,
    offSiteTargetDays: c.offSiteTargetDays,
    onSiteUsedDays: c.onSiteUsedDays,
    offSiteUsedDays: c.offSiteUsedDays,
    onSiteRemaining: c.onSiteTargetDays - c.onSiteUsedDays,
    offSiteRemaining: c.offSiteTargetDays - c.offSiteUsedDays
  };
}

export async function getMyContracts(
  ctx: ToolContext
): Promise<{ roles: AgentRole[]; today: DateKey; contracts: ContractSummary[]; note?: string }> {
  const list = await ctx.directory.listVisible(ctx.viewer, {});
  const r: { roles: AgentRole[]; today: DateKey; contracts: ContractSummary[]; note?: string } = {
    roles: ctx.viewer.roles,
    today: ctx.today,
    contracts: list.map(toSummary)
  };
  if (ctx.viewer.roles.length === 0) r.note = 'You have no contracts or read access in the contract calendar.';
  return r;
}
