import { LocalDataService } from '@orpheussystems/shared-core';
import { buildLocalDirectory, localContracts } from '../context/localDirectory';
import type { ToolContext } from '../domain/types';

export { localContracts };

export async function localContext(demoUserId: number): Promise<ToolContext> {
  const data = new LocalDataService({ demoUserId });
  const me = await data.getCurrentUser();
  return {
    viewer: { user: { id: me.id, loginName: me.loginName, displayName: me.displayName, email: me.email }, roles: me.roles },
    data,
    directory: buildLocalDirectory(),
    today: '2026-10-22'
  };
}
