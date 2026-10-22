import type { SPFI } from '@pnp/sp';
import type { Role } from '@orpheussystems/shared-core';
import { deriveRolesForContracts, resolveListIdByUrl } from '@orpheussystems/shared-core/sharepoint';

/**
 * Roles of the current user for the header menu. Never throws: a missing Contracts list, a 403 on groups or an
 * unknown user resolves to [] so the header keeps the brand and every role-less item.
 */
export async function loadRoles(sp: SPFI, contractsListUrl: string, userId: number): Promise<Role[]> {
  if (!userId) { return []; }
  try {
    const listId = await resolveListIdByUrl(sp, contractsListUrl);
    return await deriveRolesForContracts(sp, listId, userId);
  } catch (e) {
    console.warn(`Orpheus header: could not load roles from '${contractsListUrl}'; showing items without roles.`, e);
    return [];
  }
}
