import { resolveImageUrl, templateUrlError, toServerRelative } from '../templateUrl';

describe('toServerRelative', () => {
  it('resolves a site-relative path against the web', () => {
    expect(toServerRelative('Shared Documents/t.html', '/sites/a')).toBe('/sites/a/Shared Documents/t.html');
  });

  it('keeps a server-relative path as is', () => {
    expect(toServerRelative('/sites/b/Lib/t.html', '/sites/a')).toBe('/sites/b/Lib/t.html');
  });

  it('uses single slashes with a trailing-slash web and on the root site', () => {
    expect(toServerRelative('Lib/t.html', '/sites/a/')).toBe('/sites/a/Lib/t.html');
    expect(toServerRelative('Lib/t.html', '/')).toBe('/Lib/t.html');
  });

  it('trims surrounding whitespace', () => {
    expect(toServerRelative('  Lib/t.html ', '/sites/a')).toBe('/sites/a/Lib/t.html');
  });

  it('decodes percent-encoding in site-relative and server-relative paths', () => {
    expect(toServerRelative('Shared%20Documents/t.html', '/sites/a')).toBe('/sites/a/Shared Documents/t.html');
    expect(toServerRelative('/sites/b/My%20Lib/t.html', '/sites/a')).toBe('/sites/b/My Lib/t.html');
  });

  it('keeps a malformed percent sequence literally, segment by segment', () => {
    expect(toServerRelative('100%/My%20Lib/t.html', '/sites/a')).toBe('/sites/a/100%/My Lib/t.html');
  });

  it('takes the path of an absolute URL', () => {
    expect(toServerRelative('https://x.sharepoint.com/sites/a/Shared%20Documents/t.html', '/sites/z'))
      .toBe('/sites/a/Shared Documents/t.html');
  });
});

describe('resolveImageUrl', () => {
  const tpl = '/sites/a/Lib/T/t.html';
  const host = 'x.sharepoint.com';

  it('resolves a relative path against the template folder', () => {
    expect(resolveImageUrl('logo.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/T/logo.png' });
    expect(resolveImageUrl('./img/logo.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/T/img/logo.png' });
  });

  it('decodes percent-encoding in relative and server-relative paths', () => {
    expect(resolveImageUrl('img/My%20Logo.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/T/img/My Logo.png' });
    expect(resolveImageUrl('img/My Logo.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/T/img/My Logo.png' });
    expect(resolveImageUrl('/sites/b/Shared%20Documents/l.png', tpl, host))
      .toEqual({ kind: 'path', serverRelativeUrl: '/sites/b/Shared Documents/l.png' });
  });

  it('tolerates malformed percent sequences', () => {
    expect(resolveImageUrl('50%/a%20b.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/T/50%/a b.png' });
  });

  it('follows ../ segments', () => {
    expect(resolveImageUrl('../img/l.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/Lib/img/l.png' });
  });

  it('keeps a server-relative path', () => {
    expect(resolveImageUrl('/sites/b/Lib/l.png', tpl, host)).toEqual({ kind: 'path', serverRelativeUrl: '/sites/b/Lib/l.png' });
  });

  it('accepts an absolute URL on the same host (any case)', () => {
    expect(resolveImageUrl('https://x.sharepoint.com/sites/a/l.png', tpl, host))
      .toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/l.png' });
    expect(resolveImageUrl('https://X.SharePoint.com/sites/a/My%20Logo.png', tpl, host))
      .toEqual({ kind: 'path', serverRelativeUrl: '/sites/a/My Logo.png' });
  });

  it('rejects another host', () => {
    expect(() => resolveImageUrl('https://evil.com/l.png', tpl, host)).toThrow('Images must be stored on this SharePoint site');
    expect(() => resolveImageUrl('//evil.com/l.png', tpl, host)).toThrow('Images must be stored on this SharePoint site');
  });

  it('passes data URLs through', () => {
    expect(resolveImageUrl('data:image/png;base64,AA', tpl, host)).toEqual({ kind: 'data', url: 'data:image/png;base64,AA' });
  });
});

describe('templateUrlError', () => {
  const host = 'x.sharepoint.com';

  it('accepts empty', () => {
    expect(templateUrlError('', host)).toBe('');
    expect(templateUrlError('   ', host)).toBe('');
  });

  it('accepts site-relative, server-relative and same-host .html/.htm paths', () => {
    expect(templateUrlError('Shared Documents/t.html', host)).toBe('');
    expect(templateUrlError('/sites/a/Lib/t.HTM', host)).toBe('');
    expect(templateUrlError('https://x.sharepoint.com/sites/a/t.html', host)).toBe('');
  });

  it('rejects other hosts', () => {
    expect(templateUrlError('https://evil.com/t.html', host)).toMatch(/this SharePoint site/);
  });

  it('rejects files that are not .html/.htm', () => {
    expect(templateUrlError('Shared Documents/t.docx', host)).toMatch(/\.html/);
    expect(templateUrlError('/sites/a/Lib/t.html.txt', host)).toMatch(/\.html/);
  });
});
