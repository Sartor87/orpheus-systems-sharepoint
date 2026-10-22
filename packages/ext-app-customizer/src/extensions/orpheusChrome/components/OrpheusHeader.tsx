import * as React from 'react';
import * as ReactDom from 'react-dom';
import type { Role } from '@orpheussystems/shared-core';
import { orpheusBrand } from '@orpheussystems/shared-ui/brand';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import type { MenuItem } from '../IOrpheusChromeProperties';
import { visibleMenuItems } from '../menu';
import OrpheusMark from './OrpheusMark';
import { chromeVars } from './chromeVars';
import styles from './OrpheusChrome.module.scss';

export interface IOrpheusHeaderProps {
  /** Resolved (absolute) menu; filtered here by `roles`. */
  items: MenuItem[];
  roles: Role[];
  /** `location.pathname` of the current page. */
  currentPath: string;
}

function normalisePath(path: string): string {
  let p = path;
  try { p = decodeURIComponent(path); } catch { /* keep as is */ }
  return p.toLowerCase().replace(/\/+$/, '');
}

function pathOf(url: string): string {
  try {
    return normalisePath(new URL(url, 'https://placeholder.invalid').pathname);
  } catch {
    return normalisePath(url);
  }
}

/**
 * The URL of the item for the current page: an exact (case-insensitive) path match, or the longest item whose
 * path is a folder of the current path (a list item is current on any of its views).
 */
export function currentItemUrl(items: MenuItem[], currentPath: string): string | undefined {
  const current = normalisePath(currentPath);
  let best: MenuItem | undefined;
  let bestLength = -1;
  items.forEach(item => {
    const p = pathOf(item.url);
    const isPage = /\.aspx$/.test(p);
    const matches = p === current || (!isPage && p.length > 0 && current.indexOf(`${p}/`) === 0);
    if (matches && p.length > bestLength) {
      best = item;
      bestLength = p.length;
    }
  });
  return best ? best.url : undefined;
}

let menuSeq = 0;

const MenuGlyph: React.FC = () => (
  <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

/** Above SharePoint's chrome, below the Orpheus toast stack (1000010). */
export const COMPACT_MENU_Z_INDEX = 1000005;
const MENU_GAP_PX = 8;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focuses the first focusable element after `anchor` in document order, skipping anything inside `skip`. */
function focusAfter(anchor: HTMLElement, skip: HTMLElement | undefined): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !skip || !skip.contains(el));
  const next = all[all.indexOf(anchor) + 1];
  (next || anchor).focus();
}

interface IMenuPosition { top: number; right: number }

const OrpheusHeader: React.FC<IOrpheusHeaderProps> = ({ items, roles, currentPath }) => {
  const visible = visibleMenuItems(items, roles);
  const currentUrl = currentItemUrl(visible, currentPath);
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<IMenuPosition>({ top: 0, right: 0 });
  const menuId = React.useRef(`orpheus-menu-${++menuSeq}`).current;
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const links = (): HTMLAnchorElement[] =>
    listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLAnchorElement>('a')) : [];

  // SPA navigation keeps this component mounted: a new page closes the menu.
  React.useEffect(() => setOpen(false), [currentPath]);

  // Under the button, right-aligned, in viewport coordinates (the list is position: fixed in a body portal).
  React.useLayoutEffect(() => {
    if (!open) { return undefined; }
    const place = (): void => {
      if (!buttonRef.current) { return; }
      const r = buttonRef.current.getBoundingClientRect();
      setPosition({ top: r.bottom + MENU_GAP_PX, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) { return undefined; }
    const first = links()[0];
    if (first) { first.focus(); }
    // pointerdown where supported; mousedown as the fallback (closing twice is harmless).
    const onDown = (e: Event): void => {
      const target = e.target as Node;
      const inside = (buttonRef.current && buttonRef.current.contains(target)) || (listRef.current && listRef.current.contains(target));
      if (!inside) { setOpen(false); }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const closeAndFocusButton = (): void => {
    setOpen(false);
    if (buttonRef.current) { buttonRef.current.focus(); }
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    const list = links();
    const at = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeAndFocusButton();
        return;
      case 'Tab':
        // The list lives at the end of <body>: leaving it continues from the button, where it sits visually.
        if (e.shiftKey && at === 0) {
          e.preventDefault();
          closeAndFocusButton();
        } else if (!e.shiftKey && at === list.length - 1) {
          e.preventDefault();
          setOpen(false);
          if (buttonRef.current) { focusAfter(buttonRef.current, listRef.current || undefined); }
        }
        return;
      case 'ArrowDown': next = (at + 1) % list.length; break;
      case 'ArrowUp': next = (at - 1 + list.length) % list.length; break;
      case 'Home': next = 0; break;
      case 'End': next = list.length - 1; break;
      default: return;
    }
    e.preventDefault();
    list[next].focus();
  };

  const onButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const ariaCurrent = (item: MenuItem): 'page' | undefined => (item.url === currentUrl ? 'page' : undefined);

  return (
    <header className={styles.header} style={chromeVars}>
      <div className={styles.inner}>
        <a
          className={styles.brand}
          href={orpheusBrand.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${orpheusBrand.name} website (opens in a new tab)`}
        >
          <OrpheusMark size={22} color={orpheusTokens.amber} />
          <span className={styles.brandName}>
            <span className={styles.brandStrong}>{orpheusBrand.nameStrong}</span> {orpheusBrand.nameRest}
          </span>
        </a>
        {visible.length > 0 && (
          <>
            <nav className={styles.nav} aria-label="Site">
              <ul className={styles.navList}>
                {visible.map(item => (
                  <li key={item.url + item.label}>
                    <a className={styles.navLink} href={item.url} aria-current={ariaCurrent(item)}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className={styles.compact}>
              <button
                ref={buttonRef}
                type="button"
                className={styles.menuButton}
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen(o => !o)}
                onKeyDown={onButtonKeyDown}
              >
                <MenuGlyph />
                <span>Menu</span>
              </button>
              {open && ReactDom.createPortal(
                <ul
                  id={menuId}
                  ref={listRef}
                  className={styles.menu}
                  aria-label="Site"
                  data-orpheus-compact-menu=""
                  style={{ ...chromeVars, position: 'fixed', top: position.top, right: position.right, zIndex: COMPACT_MENU_Z_INDEX }}
                  onKeyDown={onListKeyDown}
                >
                  {visible.map(item => (
                    <li key={item.url + item.label}>
                      <a
                        className={styles.menuLink}
                        href={item.url}
                        aria-current={ariaCurrent(item)}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>,
                document.body
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default OrpheusHeader;
