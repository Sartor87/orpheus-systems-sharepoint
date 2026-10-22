import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-groups';
import '@pnp/sp/site-users';
import { Role } from '../models';
import { contractsOfContractorQuery } from './spQueries';
import { normaliseWebRelativeUrl } from './webUrl';

export { normaliseWebRelativeUrl };


/** Resolves a web-relative list URL such as 'Lists/Contracts' to the list GUID. */
export async function resolveListIdByUrl(sp: SPFI, webRelativeUrl: string): Promise<string> {
  const web = await sp.web.select('ServerRelativeUrl')() as { ServerRelativeUrl: string };
  const rel = normaliseWebRelativeUrl(webRelativeUrl, web.ServerRelativeUrl);
  const base = web.ServerRelativeUrl === '/' ? '' : web.ServerRelativeUrl.replace(/\/+$/, '');
  const list = await sp.web.getList(`${base}/${rel}`).select('Id')() as { Id: string };
  return list.Id;
}

/**
 * Derives the roles of the current user from the contracts list only (`userId` must be the current user's id:
 * the Admin check reads the current user's own groups, which is always allowed).
 */
export async function deriveRolesForContracts(sp: SPFI, contractsListId: string, userId: number): Promise<Role[]> {
  const roles: Role[] = [];
  const contracts = sp.web.lists.getById(contractsListId);
  const asContractor = await contracts.items.filter(contractsOfContractorQuery(userId)).select('Id').top(1)();
  if (asContractor.length > 0) { roles.push('Contractor'); }
  const asManager = await contracts.items.filter(`ContractManagerId eq ${userId}`).select('Id').top(1)();
  if (asManager.length > 0) { roles.push('ContractManager'); }
  const ownerGroup = await sp.web.associatedOwnerGroup.select('Id')();
  const myGroups = await sp.web.currentUser.groups.select('Id')();
  if (myGroups.some((g: { Id: number }) => g.Id === ownerGroup.Id)) { roles.push('Admin'); }
  return roles;
}
