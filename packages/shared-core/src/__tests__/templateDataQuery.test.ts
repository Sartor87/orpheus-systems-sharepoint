import { SPFI } from '@pnp/sp';
import { TEMPLATE_DATA_SELECT, getContractTemplateData, mapTemplateData } from '../data/templateDataQuery';
import { EMPTY_TEMPLATE_DATA } from '../templateData';

function fakeSp(result: () => Promise<unknown>) {
  const calls: { listId?: string; itemId?: number; fields?: string[] } = {};
  const sp = {
    web: {
      lists: {
        getById: (listId: string) => {
          calls.listId = listId;
          return {
            items: {
              getById: (itemId: number) => {
                calls.itemId = itemId;
                return {
                  select: (...fields: string[]) => {
                    calls.fields = fields;
                    return result;
                  }
                };
              }
            }
          };
        }
      }
    }
  } as unknown as SPFI;
  return { sp, calls };
}

describe('mapTemplateData', () => {
  it('maps nulls to empty strings and parses TemplateFields', () => {
    expect(mapTemplateData({ ConsultantPosition: null, Vendor: null, Lot: null, ApproverName: null, TemplateFields: null }))
      .toEqual(EMPTY_TEMPLATE_DATA);
    expect(mapTemplateData({ ConsultantPosition: 'P', Vendor: 'V', Lot: 'L', ApproverName: 'A', TemplateFields: 'x: 1' }))
      .toEqual({ position: 'P', vendor: 'V', lot: 'L', approverName: 'A', custom: { x: '1' } });
  });
});

describe('getContractTemplateData', () => {
  it('selects exactly TEMPLATE_DATA_SELECT on the right item', async () => {
    const { sp, calls } = fakeSp(() => Promise.resolve({ ConsultantPosition: 'P', Vendor: 'V', Lot: 'L', ApproverName: 'A', TemplateFields: 'k: v' }));
    const data = await getContractTemplateData(sp, 'list-guid', 5);
    expect(calls).toEqual({ listId: 'list-guid', itemId: 5, fields: [...TEMPLATE_DATA_SELECT] });
    expect(TEMPLATE_DATA_SELECT).toEqual(['ConsultantPosition', 'Vendor', 'Lot', 'ApproverName', 'TemplateFields']);
    expect(data.custom).toEqual({ k: 'v' });
  });
  it('returns empty data on 400 (columns missing)', async () => {
    const { sp } = fakeSp(() => Promise.reject(Object.assign(new Error('bad'), { status: 400 })));
    const data = await getContractTemplateData(sp, 'l', 1);
    expect(data).toEqual(EMPTY_TEMPLATE_DATA);
    expect(data).not.toBe(EMPTY_TEMPLATE_DATA);
  });
  it.each([403, 500])('rethrows on %i', async status => {
    const err = Object.assign(new Error('nope'), { status });
    const { sp } = fakeSp(() => Promise.reject(err));
    await expect(getContractTemplateData(sp, 'l', 1)).rejects.toBe(err);
  });
});
