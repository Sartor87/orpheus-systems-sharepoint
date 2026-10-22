import type { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/site-users';
import '@pnp/sp/site-groups';
import { deriveRoles } from '@orpheussystems/shared-core/sharepoint';
import type { SharePointListConfig } from '@orpheussystems/shared-core/sharepoint';
import type { AgentRole } from '../domain/types';

/** Shared roles plus 'HR' when the current user is in the HR group. */
export async function deriveAgentRoles(
  sp: SPFI,
  lists: SharePointListConfig,
  userId: number,
  hrGroup: string
): Promise<AgentRole[]> {
  const roles: AgentRole[] = await deriveRoles(sp, lists, userId);
  const groups = (await sp.web.currentUser.groups.select('Title')()) as { Title: string }[];
  if (groups.some(g => g.Title === hrGroup)) roles.push('HR');
  return roles;
}
