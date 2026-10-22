import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import RemainingBars from '../RemainingBars';
import { remainingBars } from '../../bars';

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => { ReactDom.unmountComponentAtNode(host); });
  host.remove();
});

function mount(values: Parameters<typeof remainingBars>[0]): void {
  act(() => { ReactDom.render(<RemainingBars bars={remainingBars(values)} />, host); });
}

describe('RemainingBars', () => {
  it('renders left/over labels, titles and meter semantics', () => {
    mount({ onSiteTarget: 63, onSiteUsed: 50.5, offSiteTarget: 10, offSiteUsed: 13 });
    const meters = host.querySelectorAll('[role="meter"]');
    expect(meters).toHaveLength(2);
    expect(host.textContent).toContain('On-site 12.5 left');
    expect(host.textContent).toContain('Off-site 3 over');
    const on = meters[0];
    expect(on.getAttribute('aria-valuemin')).toBe('0');
    expect(on.getAttribute('aria-valuemax')).toBe('63');
    expect(on.getAttribute('aria-valuenow')).toBe('50.5');
    expect(on.getAttribute('aria-label')).toBe('On-site: 50.5 of 63 days used, 12.5 left');
    expect(host.querySelector('[title="On-site: 50.5 of 63 days used, 12.5 left"]')).not.toBeNull();
    expect(host.querySelector('[title="Off-site: 13 of 10 days used, 3 over"]')).not.toBeNull();
    expect(meters[1].getAttribute('aria-valuenow')).toBe('10');
  });

  it('shows a dash when values are missing', () => {
    mount({ onSiteTarget: undefined, onSiteUsed: undefined, offSiteTarget: '', offSiteUsed: null });
    expect(host.querySelectorAll('[role="meter"]')).toHaveLength(0);
    expect(host.textContent).toBe('—');
    expect(host.querySelector('[title]')).not.toBeNull();
  });

  it('shows a dash for just the missing bar', () => {
    mount({ onSiteTarget: 10, onSiteUsed: 2, offSiteTarget: 0, offSiteUsed: 0 });
    expect(host.querySelectorAll('[role="meter"]')).toHaveLength(1);
    expect(host.textContent).toContain('On-site 8 left');
    expect(host.textContent).toContain('Off-site —');
  });
});
