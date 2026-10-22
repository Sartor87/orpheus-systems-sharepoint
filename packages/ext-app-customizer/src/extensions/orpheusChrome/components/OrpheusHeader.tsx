import * as React from 'react';
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

const OrpheusHeader: React.FC<IOrpheusHeaderProps> = ({ items, roles, currentPath }) => {
  const visible = visibleMenuItems(items, roles);
  const currentUrl = currentItemUrl(visible, currentPath);
  const [open, setOpen] = React.useState(false);
  const menuId = React.useRef(`orpheus-menu-${++menuSeq}`).current;
  const compactRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLUListElement>(null);

  const entries = (): HTMLAnchorElement[] =>
    menuRef.current ? Array.from(menuRef.current.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]')) : [];

  React.useEffect(() => {
    if (!open) { return undefined; }
    const first = entries()[0];
    if (first) { first.focus(); }
    const onDown = (e: MouseEvent): void => {
      if (compactRef.current && !compactRef.current.contains(e.target as Node)) { setOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLUListElement>): void => {
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLAnchorElement);
    let next: number;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        if (buttonRef.current) { buttonRef.current.focus(); }
        return;
      case 'Tab':
        setOpen(false);
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
            <div className={styles.compact} ref={compactRef}>
              <button
                ref={buttonRef}
                type="button"
                className={styles.menuButton}
                aria-haspopup="true"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen(o => !o)}
              >
                <MenuGlyph />
                <span>Menu</span>
              </button>
              {open && (
                <ul id={menuId} ref={menuRef} className={styles.menu} role="menu" aria-label="Site" onKeyDown={onMenuKeyDown}>
                  {visible.map(item => (
                    <li key={item.url + item.label} role="none">
                      <a
                        className={styles.menuLink}
                        role="menuitem"
                        tabIndex={-1}
                        href={item.url}
                        aria-current={ariaCurrent(item)}
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default OrpheusHeader;
