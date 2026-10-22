// Pure (no @pnp imports) so it can be unit-tested under Jest CommonJS.
/**
 * Normalises a list URL (web-relative or server-relative, with or without slashes) to the web-relative form
 * e.g. 'Lists/Contracts'.
 */
export function normaliseWebRelativeUrl(url: string, webServerRelativeUrl: string): string {
  let u = url.trim().replace(/^\/+|\/+$/g, '');
  const web = webServerRelativeUrl.trim().replace(/^\/+|\/+$/g, '');
  if (web && (u.toLowerCase() === web.toLowerCase() || u.toLowerCase().indexOf(web.toLowerCase() + '/') === 0)) {
    u = u.substring(web.length).replace(/^\/+/, '');
  }
  return u;
}
