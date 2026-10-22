import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act as domAct } from 'react-dom/test-utils';
import { renderHook, act } from '@testing-library/react-hooks/dom';
import { setIconOptions } from '@fluentui/react';
import { ContractTemplateData, LocalDataService } from '@orpheussystems/shared-core';
import type { TimesheetModel } from '@orpheussystems/shared-ui/timesheet';
import { DataContext } from '../../DataContext';
import type { IContractCalendarWebPartProps } from '../../IContractCalendarWebPartProps';
import type { TimesheetTemplateSource } from '../../templateSource';
import { TimesheetPdfModule, useCalendarState } from '../useCalendarState';
import TimesheetDialog from '../TimesheetDialog';
import { unmountToastHost } from '@orpheussystems/shared-ui/toast';

setIconOptions({ disableWarnings: true });
beforeEach(() => { unmountToastHost(); });

const baseProps: IContractCalendarWebPartProps = {
  useLocalData: true, demoUserId: 1, contractsListId: '', entriesListId: '', holidaysListId: '',
  monthsToShow: 0, blockWeekends: true, approvingOrgLabel: '', serviceProviderLabel: ''
};

const DATA: ContractTemplateData = { position: 'Analyst', vendor: 'Example Services Ltd', lot: 'Lot 1', approverName: 'A. Approver', custom: {} };
const HTML = '<div>{{grid}}</div>';

/** Same shape as the real TemplateValidationError; the hook must recognise it without instanceof. */
class FakeTemplateValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super('The timesheet template has errors');
    this.name = 'TemplateValidationError';
    this.errors = errors;
  }
}

interface Mocks {
  pdf: { downloadTimesheet: jest.Mock; downloadTimesheetFromTemplate: jest.Mock; sampleTimesheetTemplate: string };
  source: { loadTemplate: jest.Mock; loadTemplateData: jest.Mock; resolveImage: jest.Mock };
}

function mocks(): Mocks {
  return {
    pdf: {
      downloadTimesheet: jest.fn().mockResolvedValue(undefined),
      downloadTimesheetFromTemplate: jest.fn().mockResolvedValue(undefined),
      sampleTimesheetTemplate: ''
    },
    source: {
      loadTemplate: jest.fn().mockResolvedValue(HTML),
      loadTemplateData: jest.fn().mockResolvedValue(DATA),
      resolveImage: jest.fn().mockResolvedValue('data:image/png;base64,AA')
    }
  };
}

type Hook = ReturnType<typeof renderHook<{}, ReturnType<typeof useCalendarState>>>;

async function loaded(m: Mocks, timesheetTemplateUrl: string | undefined, via: 'option' | 'context' = 'option'): Promise<Hook> {
  const service = new LocalDataService({ demoUserId: 1 });
  const templateSource = m.source as TimesheetTemplateSource;
  const value = { service, props: { ...baseProps, timesheetTemplateUrl }, ...(via === 'context' ? { templateSource } : {}) };
  const wrapper: React.FC = ({ children }) => <DataContext.Provider value={value}>{children}</DataContext.Provider>;
  const loadPdf = (): Promise<TimesheetPdfModule> => Promise.resolve(m.pdf);
  const hook = renderHook(
    () => useCalendarState(via === 'option' ? { loadPdf, templateSource } : { loadPdf }),
    { wrapper }
  );
  await hook.waitFor(() => !hook.result.current.loading && !!hook.result.current.selected);
  return hook;
}

const PERIOD = { from: '2026-02-02', to: '2026-03-31' };

describe('generateTimesheet with a template', () => {
  beforeAll(() => { jest.useFakeTimers({ now: new Date(2026, 9, 22, 12), advanceTimers: true }); });
  afterAll(() => { jest.useRealTimers(); });

  it.each([undefined, '', '   '])('uses the built-in layout when the template url is %p', async url => {
    const m = mocks();
    const { result } = await loaded(m, url);
    await act(async () => { await result.current.generateTimesheet(PERIOD); });
    expect(m.pdf.downloadTimesheet).toHaveBeenCalledTimes(1);
    expect(m.pdf.downloadTimesheetFromTemplate).not.toHaveBeenCalled();
    expect(m.source.loadTemplate).not.toHaveBeenCalled();
    expect(m.source.loadTemplateData).not.toHaveBeenCalled();
  });

  it('renders from the template when the url is set', async () => {
    const m = mocks();
    const { result } = await loaded(m, 'Shared Documents/t.html');
    const contract = result.current.selected!;
    let ok = false;
    await act(async () => { ok = await result.current.generateTimesheet(PERIOD); });
    expect(ok).toBe(true);
    expect(m.pdf.downloadTimesheet).not.toHaveBeenCalled();
    expect(m.source.loadTemplateData).toHaveBeenCalledWith(contract.id);
    expect(m.pdf.downloadTimesheetFromTemplate).toHaveBeenCalledTimes(1);
    const [model, input, fileName] = m.pdf.downloadTimesheetFromTemplate.mock.calls[0] as [TimesheetModel, Record<string, unknown>, string];
    expect(model.period).toEqual(PERIOD);
    expect(input.html).toBe(HTML);
    expect(input.contract).toBe(contract);
    expect(input.templateData).toBe(DATA);
    expect(input.today).toBe('2026-10-22');
    expect(input.resolveImage).toBe(m.source.resolveImage);
    expect(fileName).toBe('Timesheet_1185-Jane-Doe_2026-02-02_2026-03-31.pdf');
    expect(result.current.timesheetError).toBeUndefined();
  });

  it('takes the template source from the data context', async () => {
    const m = mocks();
    const { result } = await loaded(m, 'Shared Documents/t.html', 'context');
    await act(async () => { await result.current.generateTimesheet(PERIOD); });
    expect(m.pdf.downloadTimesheetFromTemplate).toHaveBeenCalledTimes(1);
    expect(m.pdf.downloadTimesheet).not.toHaveBeenCalled();
  });

  it('lists the first five template errors and does not fall back', async () => {
    const m = mocks();
    m.pdf.downloadTimesheetFromTemplate.mockRejectedValue(new FakeTemplateValidationError(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7']));
    const { result } = await loaded(m, 'Shared Documents/t.html');
    let ok = true;
    await act(async () => { ok = await result.current.generateTimesheet(PERIOD); });
    expect(ok).toBe(false);
    const msg = result.current.timesheetError!;
    expect(msg.startsWith('The timesheet template has errors:')).toBe(true);
    expect(msg.match(/\n• e\d/g)).toHaveLength(5);
    expect(msg).not.toContain('e6');
    expect(msg).toContain('\n• …and 2 more');
    expect(msg.endsWith('\nAsk your site owner to fix the template or clear the template setting to use the standard layout.')).toBe(true);
    expect(m.pdf.downloadTimesheet).not.toHaveBeenCalled();
  });

  it('omits the "more" line for five errors or fewer', async () => {
    const m = mocks();
    m.pdf.downloadTimesheetFromTemplate.mockRejectedValue(new FakeTemplateValidationError(['only one']));
    const { result } = await loaded(m, 'Shared Documents/t.html');
    await act(async () => { await result.current.generateTimesheet(PERIOD); });
    expect(result.current.timesheetError).toBe(
      'The timesheet template has errors:\n• only one\nAsk your site owner to fix the template or clear the template setting to use the standard layout.'
    );
  });

  it('reports a template that cannot be loaded and downloads nothing', async () => {
    const m = mocks();
    m.source.loadTemplate.mockRejectedValue(new Error('Could not load the timesheet template "/sites/a/t.html": 404'));
    const { result } = await loaded(m, '/sites/a/t.html');
    await act(async () => { await result.current.generateTimesheet(PERIOD); });
    expect(result.current.timesheetError).toContain('"/sites/a/t.html"');
    expect(result.current.timesheetError).toContain('Could not generate the timesheet: ');
    expect(m.pdf.downloadTimesheet).not.toHaveBeenCalled();
    expect(m.pdf.downloadTimesheetFromTemplate).not.toHaveBeenCalled();
    expect(result.current.generating).toBe(false);
  });
});

describe('TimesheetDialog error text', () => {
  it('keeps line breaks', async () => {
    const [contract] = await new LocalDataService({ demoUserId: 1 }).getMyContracts();
    const host = document.createElement('div');
    document.body.appendChild(host);
    await domAct(async () => {
      ReactDom.render(
        <TimesheetDialog contract={contract} generating={false} error={'line 1\nline 2'}
          onClearError={() => undefined} onGenerate={() => Promise.resolve(false)} onDismiss={() => undefined} />,
        host
      );
    });
    for (let i = 0; i < 8; i++) { await domAct(async () => { await Promise.resolve(); }); }
    const el = Array.from(document.querySelectorAll<HTMLElement>('*')).find(n => n.textContent === 'line 1\nline 2' && n.children.length === 0);
    expect(el).toBeDefined();
    expect(el!.style.whiteSpace).toBe('pre-line');
    domAct(() => { ReactDom.unmountComponentAtNode(host); });
    host.remove();
  });
});
