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
function unmount(): void {
  act(() => { ReactDom.unmountComponentAtNode(host); });
}

afterEach(() => {
  unmount();
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

function toggle(): HTMLButtonElement {
  return host.querySelector('button[aria-expanded]') as HTMLButtonElement;
}

function openMenu(): HTMLElement {
  act(() => { toggle().click(); });
  const id = toggle().getAttribute('aria-controls') as string;
  return document.getElementById(id) as HTMLElement;
}

function compactList(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>('[data-orpheus-compact-menu]') || undefined;
}

function key(target: Element, k: string, shiftKey = false): void {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })); });
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
});

describe('OrpheusHeader compact menu (disclosure)', () => {
  it('is a disclosure: aria-controls only while open, plain links, no menu roles', () => {
    renderHeader(['Admin']);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().hasAttribute('aria-controls')).toBe(false);
    expect(compactList()).toBeUndefined();

    const list = openMenu();
    expect(list).not.toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(list.tagName).toBe('UL');
    expect(document.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
    expect(Array.from(list.querySelectorAll('a')).map(a => a.textContent)).toEqual(['My calendar', 'Contracts', 'Holidays']);
  });

  it('renders the open list in a portal under document.body, fixed, not inside the header', () => {
    renderHeader(['Admin']);
    const list = openMenu();
    expect(host.contains(list)).toBe(false);
    expect(list.parentElement).toBe(document.body);
    expect(list.style.position).toBe('fixed');
    expect(list.style.zIndex).toBe('1000005');
  });

  it('removes the portalled list on close and on unmount', () => {
    renderHeader(['Admin']);
    openMenu();
    act(() => { toggle().click(); });
    expect(compactList()).toBeUndefined();
    openMenu();
    unmount();
    expect(compactList()).toBeUndefined();
  });

  it('focuses the first link, roves with arrows, Escape closes and returns focus to the button', () => {
    renderHeader(['Admin']);
    const list = openMenu();
    const links = Array.from(list.querySelectorAll('a'));
    expect(document.activeElement).toBe(links[0]);
    key(links[0], 'ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    key(links[1], 'Escape');
    expect(compactList()).toBeUndefined();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('Tab out of the open list closes it and moves on to the next control after the button', () => {
    const after = document.createElement('button');
    after.textContent = 'next';
    document.body.appendChild(after);
    try {
      renderHeader(['Admin']);
      const list = openMenu();
      const links = Array.from(list.querySelectorAll('a'));
      act(() => { links[2].focus(); });
      key(links[2], 'Tab');
      expect(compactList()).toBeUndefined();
      expect(document.activeElement).toBe(after);
    } finally {
      after.remove();
    }
  });

  it('Shift+Tab out of the first link closes it and returns to the button', () => {
    renderHeader(['Admin']);
    const list = openMenu();
    key(list.querySelector('a') as HTMLElement, 'Tab', true);
    expect(compactList()).toBeUndefined();
    expect(document.activeElement).toBe(toggle());
  });

  it('closes on an outside pointerdown, but not on one inside the list or the button', () => {
    renderHeader([]);
    const list = openMenu();
    act(() => { list.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(compactList()).toBeDefined();
    act(() => { toggle().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(compactList()).toBeDefined();
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(compactList()).toBeUndefined();
  });

  it('closes on an outside mousedown (fallback)', () => {
    renderHeader([]);
    openMenu();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(compactList()).toBeUndefined();
  });

  it('closes when a link is clicked', () => {
    renderHeader(['Admin']);
    const list = openMenu();
    const link = list.querySelectorAll('a')[1];
    link.addEventListener('click', e => e.preventDefault());
    act(() => { link.click(); });
    expect(compactList()).toBeUndefined();
  });

  it('closes when the current path changes (SPA navigation)', () => {
    renderHeader(['Admin'], '/sites/s/SitePages/Home.aspx');
    openMenu();
    renderHeader(['Admin'], '/sites/s/SitePages/ContractCalendar.aspx');
    expect(compactList()).toBeUndefined();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('positions the list under the button, right-aligned, and follows resize', () => {
    renderHeader(['Admin']);
    const rect = (right: number): DOMRect => ({ top: 8, bottom: 40, left: right - 90, right, width: 90, height: 32, x: right - 90, y: 8, toJSON: () => ({}) });
    jest.spyOn(toggle(), 'getBoundingClientRect').mockReturnValue(rect(1000));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    const list = openMenu();
    expect(list.style.top).toBe('48px');
    expect(list.style.right).toBe('24px');
    (toggle().getBoundingClientRect as jest.Mock).mockReturnValue(rect(900));
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(list.style.right).toBe('124px');
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
