jest.mock('../../formService', () => ({
  loadContract: jest.fn(),
  loadOthersOfContractor: jest.fn(),
  saveContract: jest.fn()
}));
jest.mock('@orpheussystems/shared-ui/toast', () => ({ showToast: jest.fn() }));
// The real picker needs SharePoint and Graph; this stub keeps its contract: titleText, errorMessage, onChange(items).
jest.mock('@pnp/spfx-controls-react/lib/PeoplePicker', () => {
  const R = jest.requireActual('react');
  interface StubProps {
    titleText: string;
    errorMessage?: string;
    defaultSelectedUsers?: string[];
    onChange(items: Array<{ id: string; text: string; secondaryText: string }>): void;
  }
  return {
    PrincipalType: { User: 1 },
    PeoplePicker: (p: StubProps) => {
      const id = `pp-${p.titleText.replace(/\s/g, '')}`;
      return R.createElement('div', null,
        R.createElement('label', { htmlFor: id }, p.titleText),
        R.createElement('input', {
          id,
          defaultValue: (p.defaultSelectedUsers || []).join(','),
          onChange: (e: { target: { value: string } }) =>
            p.onChange(e.target.value ? [{ id: e.target.value, text: `User ${e.target.value}`, secondaryText: '' }] : [])
        }),
        p.errorMessage ? R.createElement('div', { role: 'alert' }, p.errorMessage) : undefined);
    }
  };
});

import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { SPFI } from '@pnp/sp';
import type { Contract } from '@orpheussystems/shared-core';
import { showToast } from '@orpheussystems/shared-ui/toast';
import { loadContract, loadOthersOfContractor, saveContract } from '../../formService';
import ContractForm, { IContractFormProps } from '../ContractForm';

const loadMock = loadContract as jest.MockedFunction<typeof loadContract>;
const othersMock = loadOthersOfContractor as jest.MockedFunction<typeof loadOthersOfContractor>;
const saveMock = saveContract as jest.MockedFunction<typeof saveContract>;
const toastMock = showToast as jest.MockedFunction<typeof showToast>;

const WEB = 'https://contoso.example/sites/s';
const sp = {} as SPFI;

const user = (id: number, name: string): Contract['contractor'] =>
  ({ id, displayName: name, email: `${name.toLowerCase()}@example.com`, loginName: `i:0#.f|membership|${name.toLowerCase()}@example.com` });

const c7: Contract = {
  id: 7,
  title: '001185_2026',
  contractCode: '1185-Iliev',
  frameworkContract: 'FWC-1',
  modality: 'Hybrid',
  contractor: user(11, 'Ada'),
  contractManager: user(12, 'Max'),
  startDate: '2026-02-06',
  latestExecutionDate: '2027-01-31',
  onSiteTargetDays: 40,
  offSiteTargetDays: 60.5,
  hoursPerDay: 8,
  country: 'BG',
  status: 'Active'
};
const bridge: Contract = { ...c7, id: 8, title: '001200_2027', contractCode: '1200-Bridge', startDate: '2027-01-15', latestExecutionDate: '2027-06-30' };
const closed: Contract = { ...c7, id: 3, title: '000900_2025', status: 'Closed', startDate: '2027-01-01', latestExecutionDate: '2027-12-31' };

let host: HTMLDivElement;
let onSaved: jest.Mock;
let onClosed: jest.Mock;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  onSaved = jest.fn();
  onClosed = jest.fn();
  loadMock.mockReset();
  othersMock.mockReset().mockResolvedValue([]);
  saveMock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  act(() => { ReactDom.unmountComponentAtNode(host); });
  host.remove();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) { await act(async () => { await Promise.resolve(); }); }
}

/** Waits past the overlap-check debounce. */
async function settle(): Promise<void> {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 450)); });
  await flush();
}

async function render(props: Partial<IContractFormProps>): Promise<void> {
  const all: IContractFormProps = {
    mode: 'new',
    sp,
    listId: 'list-guid',
    codePattern: '^\\d{4}-[A-Za-z]+(-[A-Za-z]+)*$',
    defaultCountry: 'BG',
    webUrl: WEB,
    calendarPageUrl: 'SitePages/ContractCalendar.aspx',
    peoplePickerContext: {} as IContractFormProps['peoplePickerContext'],
    onSaved,
    onClosed,
    ...props
  };
  await act(async () => { ReactDom.render(<ContractForm {...all} />, host); });
  await flush();
}

/** The control a visible label points at. */
function field(label: string): HTMLElement {
  const l = Array.from(host.querySelectorAll('label')).find(x => x.textContent === label);
  if (!l) { throw new Error(`No label "${label}"`); }
  // TextField/DatePicker labels use for=; the Dropdown labels its combobox through aria-labelledby.
  const el = l.htmlFor
    ? document.getElementById(l.htmlFor)
    : host.querySelector<HTMLElement>(`[aria-labelledby~="${l.id}"]`);
  if (!el) { throw new Error(`Label "${label}" points at nothing`); }
  return el;
}

function input(label: string): HTMLInputElement {
  return field(label) as HTMLInputElement;
}

function button(text: string): HTMLButtonElement {
  const b = Array.from(host.querySelectorAll('button')).find(x => x.textContent === text);
  if (!b) { throw new Error(`No button "${text}"`); }
  return b;
}

function isDisabled(b: HTMLButtonElement): boolean {
  return b.disabled || b.getAttribute('aria-disabled') === 'true';
}

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(el: HTMLElement): void {
  act(() => {
    el.focus();
    el.blur();
  });
}

/** Fluent renders error text in a DelayedRender (next tick) so screen readers announce it. */
async function tick(): Promise<void> {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function errorFor(el: HTMLElement): string {
  const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
  return ids.map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
}

function heading(): string {
  return (host.querySelector('h1') as HTMLElement).textContent || '';
}

function notice(): HTMLElement | undefined {
  return Array.from(host.querySelectorAll<HTMLElement>('.ms-MessageBar')).find(m => /Overlaps with/.test(m.textContent || ''));
}

describe('ContractForm — new', () => {
  it('renders empty fields with the defaults (8 hours, Active, country from defaultCountry)', async () => {
    await render({ mode: 'new', defaultCountry: 'RO' });
    expect(heading()).toBe('New contract');
    expect(input('Title').value).toBe('');
    expect(input('Contract code').value).toBe('');
    expect(input('Hours per day').value).toBe('8');
    expect(input('Country').value).toBe('RO');
    expect(field('Status').textContent).toContain('Active');
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('uses BG when no default country is configured', async () => {
    await render({ mode: 'new', defaultCountry: '' });
    expect(input('Country').value).toBe('BG');
  });

  it('keeps Save disabled until the form is valid', async () => {
    await render({ mode: 'new' });
    expect(isDisabled(button('Save'))).toBe(true);
  });

  it('marks required fields and shows a field error only after blur, linked by aria-describedby', async () => {
    await render({ mode: 'new' });
    const title = input('Title');
    expect(title.getAttribute('aria-required') === 'true' || title.required).toBe(true);
    expect(title.getAttribute('aria-invalid')).not.toBe('true');
    expect(host.textContent).not.toContain('Required.');
    blur(title);
    await tick();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(errorFor(title)).toBe('Required.');
    type(input('Contract code'), '11-x');
    blur(input('Contract code'));
    await tick();
    expect(errorFor(input('Contract code'))).toBe('Use the pattern 1185-Name or 1185-First-Last.');
  });

  it('shows every field error on a Save attempt and does not save', async () => {
    await render({ mode: 'new' });
    act(() => { button('Save').click(); });
    await tick();
    expect(errorFor(input('Title'))).toBe('Required.');
    expect(errorFor(input('Start date'))).toBe('Required.');
    expect(errorFor(input('On-site target days'))).toBe('Required.');
    expect(host.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(2); // picker stubs
    expect(document.activeElement).toBe(input('Title'));
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('Cancel closes the form', async () => {
    await render({ mode: 'new' });
    act(() => { button('Cancel').click(); });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe('ContractForm — new, save', () => {
  async function fillValidNewForm(): Promise<void> {
    type(input('Title'), '001200_2027');
    type(input('Contract code'), '1200-Bridge');
    type(input('Contractor'), '11');
    type(input('Contract manager'), '12');
    for (const [label, value] of [['Start date', '2027-01-15'], ['Latest execution date', '2027-06-30']]) {
      type(input(label), value);
      blur(input(label));
    }
    type(input('On-site target days'), '10');
    type(input('Off-site target days'), '0');
    await tick();
  }

  it('saves once on a double click while the overlap check is pending, with the fields locked meanwhile', async () => {
    let release: (list: Contract[]) => void = () => undefined;
    othersMock.mockReturnValue(new Promise<Contract[]>(resolve => { release = resolve; }));
    saveMock.mockResolvedValue(42);
    await render({ mode: 'new' });
    await fillValidNewForm();
    expect(isDisabled(button('Save'))).toBe(false);

    const save = button('Save');
    await act(async () => {
      save.click();
      save.click();
    });
    expect(input('Title').disabled).toBe(true);
    expect(isDisabled(button('Cancel'))).toBe(true);
    expect(isDisabled(save)).toBe(true);
    await act(async () => { save.click(); });

    await act(async () => { release([]); });
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [, , draft, itemId] = saveMock.mock.calls[0];
    expect(itemId).toBeUndefined();
    expect(draft).toMatchObject({ title: '001200_2027', contractorId: 11, contractManagerId: 12, startDate: '2027-01-15', latestExecutionDate: '2027-06-30' });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('unlocks the form when the check finds an overlap, so Save anyway / editing work again', async () => {
    othersMock.mockResolvedValue([c7]);
    await render({ mode: 'new' });
    await fillValidNewForm();
    await act(async () => { button('Save').click(); });
    await flush();
    expect(notice()).toBeDefined();
    expect(saveMock).not.toHaveBeenCalled();
    expect(input('Title').disabled).toBe(false);
    expect(isDisabled(button('Save'))).toBe(false);
  });
});

describe('ContractForm — edit', () => {
  it('loads the item and fills the fields', async () => {
    loadMock.mockResolvedValue(c7);
    await render({ mode: 'edit', itemId: 7 });
    expect(loadMock).toHaveBeenCalledWith(sp, 'list-guid', 7);
    expect(heading()).toBe('Edit contract 001185_2026');
    expect(input('Title').value).toBe('001185_2026');
    expect(input('Start date').value).toBe('2026-02-06');
    expect(input('Latest execution date').value).toBe('2027-01-31');
    expect(input('Off-site target days').value).toBe('60.5');
    expect(input('Contractor').value).toBe('ada@example.com');
    expect(isDisabled(button('Save'))).toBe(false);
  });

  it('disables Save again when a required value is cleared', async () => {
    loadMock.mockResolvedValue(c7);
    await render({ mode: 'edit', itemId: 7 });
    type(input('Title'), '');
    blur(input('Title'));
    await tick();
    expect(isDisabled(button('Save'))).toBe(true);
    expect(errorFor(input('Title'))).toBe('Required.');
  });

  it('treats an empty person field as missing (field error, no save, no throw)', async () => {
    loadMock.mockResolvedValue({ ...c7, contractor: { id: 0, displayName: '', email: '', loginName: '' } });
    await render({ mode: 'edit', itemId: 7 });
    expect(isDisabled(button('Save'))).toBe(true);
    act(() => { button('Save').click(); });
    expect(saveMock).not.toHaveBeenCalled();
    expect(Array.from(host.querySelectorAll('[role="alert"]')).map(a => a.textContent)).toContain('Required.');
  });

  it('opens an item with blank dates with empty date fields, and Save asks for them instead of saving', async () => {
    loadMock.mockResolvedValue({ ...c7, startDate: '', latestExecutionDate: '' });
    await render({ mode: 'edit', itemId: 7 });
    expect(host.textContent).not.toContain('could not be loaded');
    expect(input('Start date').value).toBe('');
    expect(input('Latest execution date').value).toBe('');
    expect(isDisabled(button('Save'))).toBe(true);
    act(() => { button('Save').click(); });
    await tick();
    expect(saveMock).not.toHaveBeenCalled();
    expect(errorFor(input('Start date'))).toBe('Required.');
    expect(errorFor(input('Latest execution date'))).toBe('Required.');
  });

  it('saves, shows a success toast and calls formSaved', async () => {
    loadMock.mockResolvedValue(c7);
    saveMock.mockResolvedValue(7);
    await render({ mode: 'edit', itemId: 7 });
    await settle();
    await act(async () => { button('Save').click(); });
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    const [, listId, draft, itemId] = saveMock.mock.calls[0];
    expect(listId).toBe('list-guid');
    expect(itemId).toBe(7);
    expect(draft).toMatchObject({ title: '001185_2026', contractorId: 11, contractManagerId: 12, startDate: '2026-02-06', hoursPerDay: 8 });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success', title: 'Contract 001185_2026 saved' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('on a failed save shows an error toast with the message, keeps the form open and re-enables Save', async () => {
    loadMock.mockResolvedValue(c7);
    saveMock.mockRejectedValue(new Error('Column \'Country\' is required.'));
    await render({ mode: 'edit', itemId: 7 });
    await settle();
    await act(async () => { button('Save').click(); });
    await flush();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error', text: 'Column \'Country\' is required.' }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    expect(isDisabled(button('Save'))).toBe(false);
    expect(input('Title').value).toBe('001185_2026');
  });

  it('shows a load failure instead of the fields, with a Close button', async () => {
    loadMock.mockRejectedValue(new Error('Item does not exist.'));
    await render({ mode: 'edit', itemId: 99 });
    await tick();
    expect(host.textContent).toContain('Item does not exist.');
    expect(host.querySelector('input')).toBeNull();
    act(() => { button('Close').click(); });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});

describe('ContractForm — overlap notice', () => {
  beforeEach(() => {
    loadMock.mockResolvedValue(bridge);
    othersMock.mockResolvedValue([c7, bridge, closed]);
    saveMock.mockResolvedValue(8);
  });

  it('warns about an overlapping Active/Draft contract of the same contractor (Closed ignored)', async () => {
    await render({ mode: 'edit', itemId: 8 });
    await settle();
    expect(othersMock).toHaveBeenCalledWith(sp, 'list-guid', 11);
    const n = notice();
    expect(n).toBeDefined();
    expect(n!.textContent).toContain('Overlaps with 001185_2026 until 31 Jan 2027 — bridge contract?');
    expect(n!.textContent).not.toContain('000900_2025');
    expect(button('Save anyway')).toBeTruthy();
    expect(button('Cancel')).toBeTruthy();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('Save with an unconfirmed overlap does not save; Save anyway does', async () => {
    await render({ mode: 'edit', itemId: 8 });
    await settle();
    await act(async () => { button('Save').click(); });
    await flush();
    expect(saveMock).not.toHaveBeenCalled();
    expect(notice()).toBeDefined();
    await act(async () => { button('Save anyway').click(); });
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('Cancel on the notice dismisses it without saving or closing; Save shows it again', async () => {
    await render({ mode: 'edit', itemId: 8 });
    await settle();
    const cancels = Array.from(host.querySelectorAll('button')).filter(b => b.textContent === 'Cancel');
    const noticeCancel = cancels.find(b => notice()!.contains(b))!;
    act(() => { noticeCancel.click(); });
    expect(notice()).toBeUndefined();
    expect(onClosed).not.toHaveBeenCalled();
    await act(async () => { button('Save').click(); });
    await flush();
    expect(notice()).toBeDefined();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('no notice when the only other contract is Closed', async () => {
    othersMock.mockResolvedValue([closed, bridge]);
    await render({ mode: 'edit', itemId: 8 });
    await settle();
    expect(notice()).toBeUndefined();
  });
});

describe('ContractForm — display', () => {
  it('is read-only and links to the calendar for this contract', async () => {
    loadMock.mockResolvedValue(c7);
    await render({ mode: 'display', itemId: 7 });
    expect(heading()).toBe('Contract 001185_2026');
    expect(host.querySelector('input, textarea, [role="combobox"]')).toBeNull();
    expect(host.textContent).toContain('1185-Iliev');
    expect(host.textContent).toContain('Ada');
    expect(host.textContent).toContain('2027-01-31');
    const link = Array.from(host.querySelectorAll('a')).find(a => a.textContent === 'Open calendar') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(`${WEB}/SitePages/ContractCalendar.aspx?contractId=7`);
    expect(() => button('Save')).toThrow();
    expect(othersMock).not.toHaveBeenCalled();
    act(() => { button('Close').click(); });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
