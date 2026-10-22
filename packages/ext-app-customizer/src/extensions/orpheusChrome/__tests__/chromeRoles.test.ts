jest.mock('@orpheussystems/shared-core/sharepoint', () => ({
  resolveListIdByUrl: jest.fn(),
  deriveRolesForContracts: jest.fn()
}));

import type { SPFI } from '@pnp/sp';
import { deriveRolesForContracts, resolveListIdByUrl } from '@orpheussystems/shared-core/sharepoint';
import { loadRoles } from '../chromeRoles';

const resolveMock = resolveListIdByUrl as jest.MockedFunction<typeof resolveListIdByUrl>;
const deriveMock = deriveRolesForContracts as jest.MockedFunction<typeof deriveRolesForContracts>;
const sp = {} as SPFI;

describe('loadRoles', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resolveMock.mockReset();
    deriveMock.mockReset();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('resolves the contracts list and derives the roles of the user', async () => {
    resolveMock.mockResolvedValue('list-guid');
    deriveMock.mockResolvedValue(['ContractManager', 'Admin']);
    await expect(loadRoles(sp, 'Lists/Contracts', 7)).resolves.toEqual(['ContractManager', 'Admin']);
    expect(resolveMock).toHaveBeenCalledWith(sp, 'Lists/Contracts');
    expect(deriveMock).toHaveBeenCalledWith(sp, 'list-guid', 7);
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves [] and warns when the contracts list lookup rejects (list missing, 404)', async () => {
    resolveMock.mockRejectedValue(new Error('404 List does not exist'));
    await expect(loadRoles(sp, 'Lists/Contracts', 7)).resolves.toEqual([]);
    expect(deriveMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resolves [] and warns when the role derivation rejects (403 on groups)', async () => {
    resolveMock.mockResolvedValue('list-guid');
    deriveMock.mockRejectedValue(new Error('403 Access denied'));
    await expect(loadRoles(sp, 'Lists/Contracts', 7)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('resolves [] without calling SharePoint when the user id is unknown', async () => {
    await expect(loadRoles(sp, 'Lists/Contracts', 0)).resolves.toEqual([]);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
