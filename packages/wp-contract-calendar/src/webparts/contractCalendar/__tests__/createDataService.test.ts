jest.mock('@orpheussystems/shared-core/sharepoint', () => ({
  SharePointDataService: class FakeSpService {
    constructor(public sp: unknown, public lists: unknown, public user: unknown) {}
  }
}));

import { LocalDataService } from '@orpheussystems/shared-core';
import { SharePointDataService } from '@orpheussystems/shared-core/sharepoint';
import { createDataService, requiresServiceRebuild } from '../createDataService';
import { filterListsByContentType } from '../filterListsByContentType';
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

describe('shipped default (no useLocalData, not debug, no lists)', () => {
  it('throws the configuration message', () => {
    expect(() => createDataService(base, undefined, false))
      .toThrow('Select the Contracts, Calendar entries and Holidays lists in the property pane');
  });
});

describe('requiresServiceRebuild', () => {
  it.each(['useLocalData', 'demoUserId', 'contractsListId', 'entriesListId', 'holidaysListId'])('%s rebuilds', p => {
    expect(requiresServiceRebuild(p)).toBe(true);
  });
  it.each(['monthsToShow', 'blockWeekends', 'approvingOrgLabel', 'serviceProviderLabel'])('%s does not', p => {
    expect(requiresServiceRebuild(p)).toBe(false);
  });
});

describe('filterListsByContentType', () => {
  const all = [{ Id: 'A', Title: 'a' }, { Id: 'b', Title: 'b' }, { Id: 'C', Title: 'c' }];
  it('keeps only lists with the content type, ignoring id case', () => {
    const cts = [
      { Id: 'a', Title: 'a', ContentTypes: [{ Name: 'Orpheus Contract' }] },
      { Id: 'b', Title: 'b', ContentTypes: [{ Name: 'Item' }] },
      { Id: 'c', Title: 'c', ContentTypes: [{ Name: 'Orpheus Contract' }] }
    ];
    expect(filterListsByContentType(all, cts, 'Orpheus Contract').map(l => l.Id)).toEqual(['A', 'C']);
  });
  it('excludes lists without ContentTypes', () => {
    const cts = [{ Id: 'a', Title: 'a' } as never, { Id: 'b', Title: 'b', ContentTypes: [{ Name: 'X' }] }];
    expect(filterListsByContentType(all, cts, 'X').map(l => l.Id)).toEqual(['b']);
  });
  it('returns all lists unchanged when listsWithCts is empty or undefined', () => {
    expect(filterListsByContentType(all, [], 'X')).toBe(all);
    expect(filterListsByContentType(all, undefined, 'X')).toBe(all);
  });
});
