jest.mock('@microsoft/sp-listview-extensibility', () => ({
  BaseFieldCustomizer: class {
    public properties: unknown;
    protected onInit(): Promise<void> { return Promise.resolve(); }
    public onDisposeCell(): void { /* base */ }
  }
}));

import { act } from 'react-dom/test-utils';
import RemainingDaysFieldCustomizer from '../RemainingDaysFieldCustomizer';

function makeEvent(values: Record<string, unknown>): { event: never; el: HTMLDivElement } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const event = {
    domElement: el,
    listItem: { getValueByName: (name: string): unknown => values[name] ?? '' }
  } as never;
  return { event, el };
}

describe('RemainingDaysFieldCustomizer', () => {
  it('renders bars from the four internal fields and unmounts on dispose', () => {
    const { event, el } = makeEvent({
      OnSiteTargetDays: 63, OnSiteUsedDays: '50,5', OffSiteTargetDays: 10, OffSiteUsedDays: 13
    });
    const c = new RemainingDaysFieldCustomizer();
    act(() => { c.onRenderCell(event); });
    expect(el.textContent).toContain('On-site 12.5 left');
    expect(el.textContent).toContain('Off-site 3 over');
    act(() => { c.onDisposeCell(event); });
    expect(el.innerHTML).toBe('');
    el.remove();
  });

  it('shows a dash when the fields are not in the view', () => {
    const { event, el } = makeEvent({});
    const c = new RemainingDaysFieldCustomizer();
    act(() => { c.onRenderCell(event); });
    expect(el.textContent).toBe('—');
    act(() => { c.onDisposeCell(event); });
    el.remove();
  });
});
