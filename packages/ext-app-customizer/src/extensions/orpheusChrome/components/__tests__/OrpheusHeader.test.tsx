import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { Role } from '@orpheussystems/shared-core';
import { resolveMenu } from '../../menu';
import OrpheusHeader from '../OrpheusHeader';
import OrpheusFooter from '../OrpheusFooter';

const WEB = 'https://contoso.example/sites/s';
const items = resolveMenu({}, WEB);

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  ReactDom.unmountComponentAtNode(host);
  host.remove();
});

function mount(element: React.ReactElement): void {
  act(() => { ReactDom.render(element, host); });
}

function renderHeader(roles: Role[], currentPath = '/sites/s/SitePages/Home.aspx'): void {
  mount(<OrpheusHeader items={items} roles={roles} currentPath={currentPath} />);
}

function navLabels(): string[] {
  const nav = host.querySelector('nav[aria-label="Site"]') as HTMLElement;
  return Array.from(nav.querySelectorAll('a')).map(a => a.textContent || '');
}

describe('OrpheusHeader', () => {
  it('links the brand to the Orpheus Systems website in a new tab', () => {
    renderHeader([]);
    const link = host.querySelector('a[href="https://orpheussystems.com/"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('Orpheus');
    expect(link.textContent).toContain('Systems');
    expect(link.querySelector('svg')).not.toBeNull();
  });

  it('renders brand and role-less items when the user has no roles (lookup failed)', () => {
    renderHeader([]);
    expect(navLabels()).toEqual(['My calendar']);
  });

  it('renders only the items visible to the roles', () => {
    renderHeader(['ContractManager']);
    expect(navLabels()).toEqual(['My calendar', 'Contracts']);
    renderHeader(['Admin']);
    expect(navLabels()).toEqual(['My calendar', 'Contracts', 'Holidays']);
  });

  it('marks the current page with aria-current="page", ignoring case', () => {
    renderHeader(['Admin'], '/sites/s/sitepages/contractcalendar.aspx');
    const current = host.querySelectorAll('nav[aria-label="Site"] a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('My calendar');
  });

  it('marks a list item current on any of its views', () => {
    renderHeader(['Admin'], '/sites/s/Lists/Contracts/AllItems.aspx');
    const current = host.querySelector('nav[aria-label="Site"] a[aria-current="page"]') as HTMLElement;
    expect(current.textContent).toBe('Contracts');
  });

  it('opens and closes the compact menu from its button and with Escape', () => {
    renderHeader(['Admin']);
    const button = host.querySelector('button[aria-haspopup="true"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[role="menu"]')).toBeNull();

    act(() => { button.click(); });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[role="menu"]') as HTMLElement;
    const entries = Array.from(menu.querySelectorAll('a[role="menuitem"]'));
    expect(entries.map(a => a.textContent)).toEqual(['My calendar', 'Contracts', 'Holidays']);
    expect(document.activeElement).toBe(entries[0]);

    act(() => { entries[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(entries[1]);

    act(() => { menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('closes the compact menu on an outside click', () => {
    renderHeader([]);
    const button = host.querySelector('button[aria-haspopup="true"]') as HTMLButtonElement;
    act(() => { button.click(); });
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });
});

describe('OrpheusFooter', () => {
  it('renders the kicker, the contact address and the version', () => {
    mount(<OrpheusFooter version="1.2.3" />);
    expect(host.textContent).toContain('SOFTWARE ARCHITECTURE CONSULTANCY · SOFIA, BULGARIA · EU');
    const mail = host.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;
    expect(mail.getAttribute('href')).toBe('mailto:kiril.iliev@orpheussystems.com');
    expect(mail.textContent).toBe('kiril.iliev@orpheussystems.com');
    expect(host.textContent).toContain('v1.2.3');
  });
});
