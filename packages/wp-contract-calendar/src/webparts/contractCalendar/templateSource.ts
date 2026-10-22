import type { SPFI } from '@pnp/sp';
// Type-only: PnP type augmentations for web.getFileByServerRelativePath; the web part registers them at runtime.
import type {} from '@pnp/sp/webs';
import type {} from '@pnp/sp/files';
import { ContractTemplateData, demoTemplateData } from '@orpheussystems/shared-core';
import { getContractTemplateData } from '@orpheussystems/shared-core/sharepoint';
import type { ImageResolver } from '@orpheussystems/shared-ui/pdf';
import { resolveImageUrl } from './templateUrl';

/** Where the timesheet template, its contract data and its images come from. */
export interface TimesheetTemplateSource {
  loadTemplate(): Promise<string>;
  loadTemplateData(contractId: number): Promise<ContractTemplateData>;
  resolveImage: ImageResolver;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg'];

function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

function reasonOf(e: unknown): string {
  const status = statusOf(e);
  if (status === 404) { return 'file not found (404)'; }
  if (status === 403 || status === 401) { return `access denied (${status})`; }
  return e instanceof Error ? e.message : String(e);
}

function loadError(url: string, reason: string): Error {
  return new Error(`Could not load the timesheet template "${url}": ${reason}`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('could not read the image'));
    reader.readAsDataURL(blob);
  });
}

/** Template file, contract columns and images from this SharePoint site, fetched on every call (no cache). */
export function createSharePointTemplateSource(
  sp: SPFI, contractsListId: string, templateServerRelativeUrl: string, host: string
): TimesheetTemplateSource {
  return {
    async loadTemplate(): Promise<string> {
      let text: string;
      try {
        text = await sp.web.getFileByServerRelativePath(templateServerRelativeUrl).getText();
      } catch (e) {
        throw loadError(templateServerRelativeUrl, reasonOf(e));
      }
      if (!text || !text.trim()) { throw loadError(templateServerRelativeUrl, 'the template is empty'); }
      return text;
    },
    loadTemplateData(contractId: number): Promise<ContractTemplateData> {
      return getContractTemplateData(sp, contractsListId, contractId);
    },
    async resolveImage(src: string): Promise<string> {
      const target = resolveImageUrl(src, templateServerRelativeUrl, host);
      if (target.kind === 'data') { return target.url; }
      const path = target.serverRelativeUrl;
      let blob: Blob;
      try {
        blob = await sp.web.getFileByServerRelativePath(path).getBlob();
      } catch (e) {
        throw new Error(`Could not load the image "${path}": ${reasonOf(e)}`);
      }
      const type = (blob.type || '').split(';')[0].trim().toLowerCase();
      if (IMAGE_TYPES.indexOf(type) === -1) {
        throw new Error(`The image "${path}" must be PNG or JPEG (got ${type || 'an unknown type'})`);
      }
      const url = await blobToDataUrl(blob);
      return `data:${type};base64,${url.slice(url.indexOf(',') + 1)}`;
    }
  };
}

/** Local/workbench mode: the bundled starter template with the demo contract data. */
export function createLocalTemplateSource(loadSample: () => Promise<string>): TimesheetTemplateSource {
  return {
    loadTemplate: loadSample,
    loadTemplateData: contractId => Promise.resolve(demoTemplateData(contractId)),
    resolveImage: src => /^data:/i.test(src.trim())
      ? Promise.resolve(src.trim())
      : Promise.reject(new Error(`Only data: images are available in local demo mode ("${src}")`))
  };
}

/** A configured template value that cannot be used (e.g. another host): generation reports it, nothing is fetched. */
export function invalidTemplateSource(url: string, reason: string): TimesheetTemplateSource {
  const fail = (): Promise<never> => Promise.reject(loadError(url, reason));
  return { loadTemplate: fail, loadTemplateData: fail, resolveImage: fail };
}
