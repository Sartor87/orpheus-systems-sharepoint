/** Path helpers for the optional timesheet HTML template; pure and host-parameterised. */

export type ResolvedImage = { kind: 'data'; url: string } | { kind: 'path'; serverRelativeUrl: string };

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;
const HTTP = /^https?:\/\//i;
const TEMPLATE_EXT = /\.html?$/i;
const OTHER_HOST_IMAGE = 'Images must be stored on this SharePoint site';

function decode(path: string): string {
  try { return decodeURIComponent(path); } catch { return path; }
}

/** Host and decoded path of an http(s) or protocol-relative URL; undefined for anything else. */
function parseAbsolute(value: string): { host: string; path: string } | undefined {
  if (!HTTP.test(value) && !value.startsWith('//')) { return undefined; }
  try {
    const u = new URL(value, 'https://placeholder.invalid');
    return { host: u.host.toLowerCase(), path: decode(u.pathname) };
  } catch {
    return undefined;
  }
}

/** Joins and normalises segments: drops empty and `.` segments, `..` removes the previous one. */
function normalise(segments: string[]): string {
  const out: string[] = [];
  for (const s of segments) {
    if (s === '' || s === '.') { continue; }
    if (s === '..') { out.pop(); continue; }
    out.push(s);
  }
  return '/' + out.join('/');
}

/** Site-relative path → `<web>/<path>`; a server-relative path stays; an absolute URL gives its path. */
export function toServerRelative(path: string, webServerRelativeUrl: string): string {
  const p = path.trim();
  const abs = parseAbsolute(p);
  if (abs) { return abs.path; }
  if (p.startsWith('/')) { return p; }
  const web = webServerRelativeUrl.replace(/\/+$/, '');
  return `${web}/${p.replace(/^\/+/, '')}`;
}

/**
 * Where an `<img src>` of the template comes from: a `data:` URL as is, or a server-relative path on this
 * host (relative paths resolve against the template's folder). Throws for any other host or scheme.
 */
export function resolveImageUrl(src: string, templateServerRelativeUrl: string, host: string): ResolvedImage {
  const s = src.trim();
  if (/^data:/i.test(s)) { return { kind: 'data', url: s }; }
  const abs = parseAbsolute(s);
  if (abs) {
    if (abs.host !== host.toLowerCase()) { throw new Error(OTHER_HOST_IMAGE); }
    return { kind: 'path', serverRelativeUrl: abs.path };
  }
  if (ABSOLUTE.test(s)) { throw new Error(OTHER_HOST_IMAGE); }
  if (s.startsWith('/')) { return { kind: 'path', serverRelativeUrl: normalise(s.split('/')) }; }
  const folder = templateServerRelativeUrl.split('/').slice(0, -1);
  return { kind: 'path', serverRelativeUrl: normalise(folder.concat(s.split('/'))) };
}

/** Property pane check: '' when valid or empty. */
export function templateUrlError(value: string, host: string): string {
  const v = (value || '').trim();
  if (!v) { return ''; }
  const abs = parseAbsolute(v);
  if (abs && abs.host !== host.toLowerCase()) {
    return 'The template must be stored on this SharePoint site. Use a site-relative or server-relative path.';
  }
  if (!abs && ABSOLUTE.test(v)) {
    return 'Use a site-relative or server-relative path to the template.';
  }
  const path = abs ? abs.path : v;
  if (!TEMPLATE_EXT.test(path)) { return 'The template must be an .html or .htm file.'; }
  return '';
}
