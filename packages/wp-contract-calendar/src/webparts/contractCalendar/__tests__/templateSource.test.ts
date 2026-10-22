jest.mock('@orpheussystems/shared-core/sharepoint', () => ({
  getContractTemplateData: jest.fn()
}));

import type { SPFI } from '@pnp/sp';
import { demoTemplateData } from '@orpheussystems/shared-core';
import { getContractTemplateData } from '@orpheussystems/shared-core/sharepoint';
import { createLocalTemplateSource, createSharePointTemplateSource, invalidTemplateSource } from '../templateSource';

interface FakeFile { getText?: () => Promise<string>; getBlob?: () => Promise<Blob> }

function fakeSp(files: Record<string, FakeFile>): { sp: SPFI; requested: string[] } {
  const requested: string[] = [];
  const sp = {
    web: {
      getFileByServerRelativePath: (path: string) => {
        requested.push(path);
        const f = files[path];
        const missing = (): Promise<never> => Promise.reject(Object.assign(new Error('Error making HttpClient request in queryable [404] Not Found'), { status: 404 }));
        return { getText: f?.getText || missing, getBlob: f?.getBlob || missing };
      }
    }
  } as unknown as SPFI;
  return { sp, requested };
}

const TPL = '/sites/a/Lib/T/t.html';
const HOST = 'x.sharepoint.com';

describe('createSharePointTemplateSource', () => {
  it('returns the template text', async () => {
    const { sp, requested } = fakeSp({ [TPL]: { getText: () => Promise.resolve('<div>{{grid}}</div>') } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.loadTemplate()).resolves.toBe('<div>{{grid}}</div>');
    expect(requested).toEqual([TPL]);
  });

  it('names the url when the file is missing', async () => {
    const { sp } = fakeSp({});
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.loadTemplate()).rejects.toThrow(`Could not load the timesheet template "${TPL}": `);
    await expect(src.loadTemplate()).rejects.toThrow(/not found/);
  });

  it('reports access denied', async () => {
    const { sp } = fakeSp({ [TPL]: { getText: () => Promise.reject(Object.assign(new Error('[403] Forbidden'), { status: 403 })) } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.loadTemplate()).rejects.toThrow(`Could not load the timesheet template "${TPL}": access denied`);
  });

  it('rejects an empty template', async () => {
    const { sp } = fakeSp({ [TPL]: { getText: () => Promise.resolve('  \n ') } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.loadTemplate()).rejects.toThrow(`Could not load the timesheet template "${TPL}": the template is empty`);
  });

  it('reads template data from the contracts list', async () => {
    const data = { position: 'P', vendor: 'V', lot: 'L', approverName: 'A', custom: {} };
    (getContractTemplateData as jest.Mock).mockResolvedValue(data);
    const { sp } = fakeSp({});
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.loadTemplateData(7)).resolves.toBe(data);
    expect(getContractTemplateData).toHaveBeenCalledWith(sp, 'list-1', 7);
  });

  it('inlines a PNG resolved against the template folder', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const { sp, requested } = fakeSp({ '/sites/a/Lib/img/l.png': { getBlob: () => Promise.resolve(png) } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('../img/l.png')).resolves.toBe('data:image/png;base64,iVBORw==');
    expect(requested).toEqual(['/sites/a/Lib/img/l.png']);
  });

  it('accepts JPEG', async () => {
    const jpg = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' });
    const { sp } = fakeSp({ '/sites/a/Lib/T/l.jpg': { getBlob: () => Promise.resolve(jpg) } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('l.jpg')).resolves.toMatch(/^data:image\/jpeg;base64,/);
  });

  it('rejects other image types', async () => {
    const gif = new Blob([new Uint8Array([71, 73, 70])], { type: 'image/gif' });
    const { sp } = fakeSp({ '/sites/a/Lib/T/l.gif': { getBlob: () => Promise.resolve(gif) } });
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('l.gif')).rejects.toThrow(/PNG or JPEG/);
  });

  it('rejects images on another host without fetching', async () => {
    const { sp, requested } = fakeSp({});
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('https://evil.com/l.png')).rejects.toThrow('Images must be stored on this SharePoint site');
    expect(requested).toEqual([]);
  });

  it('names the image when it cannot be fetched', async () => {
    const { sp } = fakeSp({});
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('missing.png')).rejects.toThrow('/sites/a/Lib/T/missing.png');
  });

  it('passes data URLs through', async () => {
    const { sp, requested } = fakeSp({});
    const src = createSharePointTemplateSource(sp, 'list-1', TPL, HOST);
    await expect(src.resolveImage('data:image/png;base64,AA')).resolves.toBe('data:image/png;base64,AA');
    expect(requested).toEqual([]);
  });
});

describe('createLocalTemplateSource', () => {
  it('returns the sample template and the demo data', async () => {
    const src = createLocalTemplateSource(() => Promise.resolve('<div>{{grid}}</div>'));
    await expect(src.loadTemplate()).resolves.toBe('<div>{{grid}}</div>');
    await expect(src.loadTemplateData(1)).resolves.toEqual(demoTemplateData(1));
  });

  it('accepts data images only', async () => {
    const src = createLocalTemplateSource(() => Promise.resolve(''));
    await expect(src.resolveImage('data:image/png;base64,AA')).resolves.toBe('data:image/png;base64,AA');
    await expect(src.resolveImage('logo.png')).rejects.toThrow(/data:/);
  });
});

describe('invalidTemplateSource', () => {
  it('fails to load with the reason', async () => {
    const src = invalidTemplateSource('https://evil.com/t.html', 'The template must be stored on this SharePoint site');
    await expect(src.loadTemplate()).rejects.toThrow(
      'Could not load the timesheet template "https://evil.com/t.html": The template must be stored on this SharePoint site'
    );
  });
});
