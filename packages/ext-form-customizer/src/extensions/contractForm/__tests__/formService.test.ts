// PnPjs ships ES modules only; the chain is faked below, so its side-effect imports are stubbed.
jest.mock('@pnp/sp', () => ({}));
jest.mock('@pnp/sp/webs', () => ({}));
jest.mock('@pnp/sp/lists', () => ({}));
jest.mock('@pnp/sp/items', () => ({}));
jest.mock('@pnp/sp/site-users', () => ({}));
jest.mock('@pnp/sp/site-groups', () => ({}));
jest.mock('@pnp/sp/batching', () => ({}));

import type { SPFI } from '@pnp/sp';
import type { SPContractItem } from '@orpheussystems/shared-core/sharepoint';
import type { ContractDraft } from '../formModel';
import {
  draftToItem,
  loadContract,
  loadOthersOfContractor,
  spErrorMessage,
  saveContract
} from '../formService';

interface Call { name: string; args: unknown[] }

/** A chainable PnPjs stand-in: records every call; invoking the chain (or add/update) resolves `result`. */
function fakeSpChain(result: unknown): { sp: SPFI; calls: Call[] } {
  const calls: Call[] = [];
  const node = (): unknown => {
    const fn = (): Promise<unknown> => Promise.resolve(result);
    return new Proxy(fn, {
      get: (_t, name: string) => {
        if (name === 'lists' || name === 'items') { calls.push({ name, args: [] }); return node(); }
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return name === 'add' || name === 'update' ? Promise.resolve(result) : node();
        };
      }
    });
  };
  return { sp: { web: node() } as unknown as SPFI, calls };
}

const spItem: SPContractItem = {
  Id: 7,
  Title: '001185_2026',
  ContractCode: '1185-Iliev',
  FrameworkContract: 'FWC-1',
  Modality: 'Hybrid',
  Contractor: { Id: 11, Title: 'Ada Admin', EMail: 'ada@example.com', Name: 'i:0#.f|membership|ada@example.com' },
  ContractManager: { Id: 12, Title: 'Max Manager', EMail: 'max@example.com', Name: 'i:0#.f|membership|max@example.com' },
  StartDate: '2026-02-05T22:00:00Z',
  LatestExecutionDate: '2027-01-30T22:00:00Z',
  OnSiteTargetDays: 40,
  OffSiteTargetDays: 60.5,
  HoursPerDay: 8,
  Country: 'BG',
  Status: 'Active'
};

const draft: ContractDraft = {
  title: ' 001200_2027 ',
  contractCode: ' 1200-Bridge ',
  frameworkContract: '',
  modality: 'On-site',
  contractorId: 11,
  contractManagerId: 12,
  startDate: '2027-01-15',
  latestExecutionDate: '2027-06-30',
  onSiteTargetDays: 10,
  offSiteTargetDays: 0,
  country: 'BG',
  status: 'Active'
};

describe('formService', () => {
  it('loads a contract by id with the shared select/expand and normalises dates', async () => {
    const { sp, calls } = fakeSpChain(spItem);
    const c = await loadContract(sp, 'list-guid', 7);
    expect(calls.find(c2 => c2.name === 'getById' && c2.args[0] === 'list-guid')).toBeDefined();
    expect(calls.find(c2 => c2.name === 'getById' && c2.args[0] === 7)).toBeDefined();
    expect(calls.find(c2 => c2.name === 'expand')?.args).toEqual(['Contractor', 'ContractManager']);
    expect(c.startDate).toBe('2026-02-06');
    expect(c.latestExecutionDate).toBe('2027-01-31');
    expect(c.contractor.id).toBe(11);
  });

  it('loads the other contracts of a contractor with the contractor filter', async () => {
    const { sp, calls } = fakeSpChain([spItem]);
    const others = await loadOthersOfContractor(sp, 'list-guid', 11);
    expect(calls.find(c => c.name === 'filter')?.args).toEqual(['ContractorId eq 11']);
    expect(others.map(o => o.id)).toEqual([7]);
  });

  it('maps a draft to list item fields (trimmed text, person ids, yyyy-MM-dd dates, null hours when empty)', () => {
    expect(draftToItem(draft)).toEqual({
      Title: '001200_2027',
      ContractCode: '1200-Bridge',
      FrameworkContract: '',
      Modality: 'On-site',
      ContractorId: 11,
      ContractManagerId: 12,
      StartDate: '2027-01-15',
      LatestExecutionDate: '2027-06-30',
      OnSiteTargetDays: 10,
      OffSiteTargetDays: 0,
      HoursPerDay: null,
      Country: 'BG',
      Status: 'Active'
    });
  });

  it('adds a new item and returns its id', async () => {
    const { sp, calls } = fakeSpChain({ Id: 42 });
    await expect(saveContract(sp, 'list-guid', draft)).resolves.toBe(42);
    const add = calls.find(c => c.name === 'add');
    expect((add?.args[0] as Record<string, unknown>).ContractorId).toBe(11);
  });

  it('updates an existing item and returns its id', async () => {
    const { sp, calls } = fakeSpChain({});
    await expect(saveContract(sp, 'list-guid', draft, 7)).resolves.toBe(7);
    expect(calls.find(c => c.name === 'getById' && c.args[0] === 7)).toBeDefined();
    expect(calls.find(c => c.name === 'update')).toBeDefined();
    expect(calls.find(c => c.name === 'add')).toBeUndefined();
  });

  it('rejects a failed save with the SharePoint message', async () => {
    const body = JSON.stringify({ 'odata.error': { message: { value: 'Bad value.' } } });
    const failing = { web: { lists: { getById: () => ({ items: {
      add: () => Promise.reject(new Error(`[400] Bad Request ::> ${body}`))
    } }) } } } as unknown as SPFI;
    await expect(saveContract(failing, 'list-guid', draft)).rejects.toThrow(/^Bad value\.$/);
  });

  it('extracts the SharePoint message from a PnPjs request error', () => {
    const body = JSON.stringify({ 'odata.error': { code: '-1, x', message: { lang: 'en-US', value: 'Column \'Country\' is required.' } } });
    const e = new Error(`Error making HttpClient request in queryable [400] Bad Request ::> ${body}`);
    expect(spErrorMessage(e)).toBe('Column \'Country\' is required.');
    const verbose = JSON.stringify({ error: { message: { value: 'Access denied.' } } });
    expect(spErrorMessage(new Error(`[403] Forbidden ::> ${verbose}`))).toBe('Access denied.');
    expect(spErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(spErrorMessage('odd')).toBe('odd');
  });
});
