jest.mock('@microsoft/sp-application-base', () => ({
  BaseApplicationCustomizer: class {
    public context: unknown;
    public properties: unknown;
    public manifest: unknown;
    protected onDispose(): void { /* base */ }
  },
  PlaceholderName: { Top: 1, Bottom: 2 }
}));
jest.mock('@microsoft/sp-core-library', () => ({ Log: { info: jest.fn() } }));
jest.mock('@pnp/sp', () => ({ spfi: () => ({ using: () => ({}) }), SPFx: jest.fn() }));
jest.mock('OrpheusChromeApplicationCustomizerStrings', () => ({ Title: 'OrpheusChrome' }), { virtual: true });
jest.mock('../chromeRoles', () => ({ loadRoles: jest.fn() }));
jest.mock('../chromeBrand', () => ({ announceOrpheus: jest.fn() }));

import type { Role } from '@orpheussystems/shared-core';
import { act } from 'react-dom/test-utils';
import OrpheusChromeApplicationCustomizer from '../OrpheusChromeApplicationCustomizer';
import { loadRoles } from '../chromeRoles';

const TOP = 1;
const BOTTOM = 2;

type Handler = () => void;
class FakeEvent {
  public handlers: Handler[] = [];
  public add(_observer: unknown, h: Handler): void { this.handlers.push(h); }
  public remove(_observer: unknown, h: Handler): void { this.handlers = this.handlers.filter(x => x !== h); }
  public fire(): void { act(() => { this.handlers.forEach(h => h()); }); }
}

interface FakeContent { name: number; domElement: HTMLDivElement; dispose(): void }

function fakeProvider(): {
  placeholderNames: number[];
  changedEvent: FakeEvent;
  created: FakeContent[];
  tryCreateContent: jest.Mock;
} {
  const created: FakeContent[] = [];
  return {
    placeholderNames: [TOP, BOTTOM],
    changedEvent: new FakeEvent(),
    created,
    tryCreateContent: jest.fn((name: number, options: { onDispose?: (c: FakeContent) => void }) => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const content: FakeContent = {
        name,
        domElement: el,
        dispose(): void {
          if (options.onDispose) { options.onDispose(content); }
          el.remove();
        }
      };
      created.push(content);
      return content;
    })
  };
}

const loadRolesMock = loadRoles as jest.MockedFunction<typeof loadRoles>;

function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>(_resolve => { resolve = _resolve; });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function setup(): {
  customizer: OrpheusChromeApplicationCustomizer;
  provider: ReturnType<typeof fakeProvider>;
  navigated: FakeEvent;
  roles: ReturnType<typeof deferred<Role[]>>;
} {
  const provider = fakeProvider();
  const navigated = new FakeEvent();
  const roles = deferred<Role[]>();
  loadRolesMock.mockReset();
  loadRolesMock.mockReturnValue(roles.promise);
  const customizer = new OrpheusChromeApplicationCustomizer();
  const c = customizer as unknown as Record<string, unknown>;
  c.context = {
    placeholderProvider: provider,
    application: { navigatedEvent: navigated },
    pageContext: { web: { absoluteUrl: 'http://localhost/sites/s' }, legacyPageContext: { userId: 7 } }
  };
  c.properties = {};
  c.manifest = { version: '1.0.0' };
  return { customizer, provider, navigated, roles };
}

function dispose(customizer: OrpheusChromeApplicationCustomizer): void {
  act(() => { (customizer as unknown as { onDispose(): void }).onDispose(); });
}

const headers = (): number => document.querySelectorAll('header').length;
const footers = (): number => document.querySelectorAll('footer').length;
const createdFor = (p: ReturnType<typeof fakeProvider>, name: number): number => p.created.filter(c => c.name === name).length;

afterEach(() => {
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('OrpheusChromeApplicationCustomizer lifecycle', () => {
  it('renders the header and the footer straight away, with role-less items', async () => {
    const { customizer, provider } = setup();
    await act(async () => { await customizer.onInit(); });
    expect(createdFor(provider, TOP)).toBe(1);
    expect(createdFor(provider, BOTTOM)).toBe(1);
    expect(headers()).toBe(1);
    expect(footers()).toBe(1);
    expect(Array.from(document.querySelectorAll('nav[aria-label="Site"] a')).map(a => a.textContent)).toEqual(['My calendar']);
    dispose(customizer);
  });

  it('re-renders with the loaded roles', async () => {
    const { customizer, roles } = setup();
    await act(async () => { await customizer.onInit(); });
    roles.resolve(['Admin']);
    await flush();
    expect(document.querySelectorAll('nav[aria-label="Site"] a')).toHaveLength(3);
    dispose(customizer);
  });

  it('does not recreate placeholders on a placeholder change when they are still live', async () => {
    const { customizer, provider } = setup();
    await act(async () => { await customizer.onInit(); });
    provider.changedEvent.fire();
    provider.changedEvent.fire();
    expect(provider.tryCreateContent).toHaveBeenCalledTimes(2);
    expect(headers()).toBe(1);
    dispose(customizer);
  });

  it('recreates a placeholder SharePoint disposed, without duplicates', async () => {
    const { customizer, provider } = setup();
    await act(async () => { await customizer.onInit(); });
    act(() => { provider.created[0].dispose(); });
    expect(headers()).toBe(0);
    provider.changedEvent.fire();
    expect(createdFor(provider, TOP)).toBe(2);
    expect(createdFor(provider, BOTTOM)).toBe(1);
    expect(headers()).toBe(1);
    expect(footers()).toBe(1);
    dispose(customizer);
  });

  it('recreates a placeholder whose element was detached without a dispose', async () => {
    const { customizer, provider } = setup();
    await act(async () => { await customizer.onInit(); });
    const stale = provider.created.filter(c => c.name === TOP)[0];
    stale.domElement.remove();
    provider.changedEvent.fire();
    expect(createdFor(provider, TOP)).toBe(2);
    expect(stale.domElement.childElementCount).toBe(0);
    expect(headers()).toBe(1);
    dispose(customizer);
  });

  it('re-renders on SPA navigation with the new path', async () => {
    const { customizer, navigated } = setup();
    window.history.pushState({}, '', '/sites/s/SitePages/Home.aspx');
    await act(async () => { await customizer.onInit(); });
    expect(document.querySelector('a[aria-current="page"]')).toBeNull();
    window.history.pushState({}, '', '/sites/s/SitePages/ContractCalendar.aspx');
    navigated.fire();
    expect((document.querySelector('nav[aria-label="Site"] a[aria-current="page"]') as HTMLElement).textContent).toBe('My calendar');
    dispose(customizer);
  });

  it('unmounts both roots and unsubscribes on dispose', async () => {
    const { customizer, provider, navigated } = setup();
    await act(async () => { await customizer.onInit(); });
    dispose(customizer);
    expect(headers()).toBe(0);
    expect(footers()).toBe(0);
    expect(provider.changedEvent.handlers).toHaveLength(0);
    expect(navigated.handlers).toHaveLength(0);
  });

  it('does not render when roles arrive after dispose', async () => {
    const { customizer, provider, roles } = setup();
    await act(async () => { await customizer.onInit(); });
    dispose(customizer);
    roles.resolve(['Admin']);
    await flush();
    expect(headers()).toBe(0);
    expect(provider.tryCreateContent).toHaveBeenCalledTimes(2);
  });

  it('renders no footer when showFooter is false', async () => {
    const { customizer, provider } = setup();
    (customizer as unknown as Record<string, unknown>).properties = { showFooter: false };
    await act(async () => { await customizer.onInit(); });
    expect(createdFor(provider, BOTTOM)).toBe(0);
    expect(footers()).toBe(0);
    dispose(customizer);
  });
});
