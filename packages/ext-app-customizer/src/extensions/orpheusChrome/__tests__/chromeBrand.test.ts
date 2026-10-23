import { activeToasts, showBrandToastOnce, unmountToastHost } from '@orpheussystems/shared-ui/toast';
import { announceOrpheus } from '../chromeBrand';

const SITE_KEY = 'orpheus.site.brandToastShownAt';

describe('announceOrpheus', () => {
  beforeEach(() => {
    window.localStorage.clear();
    unmountToastHost();
  });
  afterAll(() => unmountToastHost());

  it('shows the Orpheus Systems brand toast once, under the site-wide key', () => {
    expect(announceOrpheus()).toBe(true);
    expect(announceOrpheus()).toBe(false);
    const brand = activeToasts().filter(t => t.kind === 'brand');
    expect(brand).toHaveLength(1);
    expect(brand[0].title).toBe('Orpheus Systems');
    expect(brand[0].link && brand[0].link.href).toBe('https://orpheussystems.com/');
    expect(window.localStorage.getItem(SITE_KEY)).not.toBeNull();
  });

  it('shares the key with the web part: a page with both shows one brand toast', () => {
    announceOrpheus();
    // The web part calls the same API with the default (site-wide) key.
    expect(showBrandToastOnce()).toBe(false);
    expect(activeToasts().filter(t => t.kind === 'brand')).toHaveLength(1);
  });

  it('stays quiet for 7 days once any Orpheus component has shown it', () => {
    window.localStorage.setItem(SITE_KEY, String(Date.now() - 60 * 60 * 1000));
    expect(announceOrpheus()).toBe(false);
    expect(activeToasts()).toHaveLength(0);
  });
});
