jest.mock('@orpheussystems/shared-core/sharepoint', () => ({
  SharePointDataService: class FakeSpService {
    constructor(public sp: unknown, public lists: unknown, public user: unknown) {}
  }
}));

import { LocalDataService } from '@orpheussystems/shared-core';
import { SharePointDataService } from '@orpheussystems/shared-core/sharepoint';
import { createDataService } from '../createDataService';
import type { IContractCalendarWebPartProps } from '../IContractCalendarWebPartProps';

const base: IContractCalendarWebPartProps = {
  useLocalData: undefined as unknown as boolean,
  demoUserId: 1,
  contractsListId: '',
  entriesListId: '',
  holidaysListId: '',
  monthsToShow: 0,
  blockWeekends: true,
  approvingOrgLabel: 'Client approval',
  serviceProviderLabel: 'Service provider'
};
const user = { id: 7, loginName: 'a', displayName: 'A', email: 'a@x', roles: [] };
const sp = {} as never;

describe('createDataService', () => {
  it('uses LocalDataService when useLocalData is undefined and isDebug', () => {
    expect(createDataService(base, undefined, true)).toBeInstanceOf(LocalDataService);
  });

  it('uses LocalDataService when useLocalData is true even if not debug', () => {
    expect(createDataService({ ...base, useLocalData: true }, undefined, false)).toBeInstanceOf(LocalDataService);
  });

  it('uses SharePointDataService when useLocalData false and lists set', () => {
    const svc = createDataService(
      { ...base, useLocalData: false, contractsListId: 'c', entriesListId: 'e', holidaysListId: 'h' },
      sp, true, user
    );
    expect(svc).toBeInstanceOf(SharePointDataService);
  });

  it('throws when not local and a list id is missing', () => {
    expect(() => createDataService({ ...base, useLocalData: false, contractsListId: 'c', entriesListId: 'e' }, sp, false, user))
      .toThrow('Select the Contracts, Calendar entries and Holidays lists in the property pane');
  });

  it('throws when not local and current user is missing', () => {
    expect(() => createDataService(
      { ...base, useLocalData: false, contractsListId: 'c', entriesListId: 'e', holidaysListId: 'h' }, sp, false))
      .toThrow('Current user is not resolved');
  });
});
