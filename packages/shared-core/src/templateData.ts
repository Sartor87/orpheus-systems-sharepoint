import templateJson from './data/fixtures/templateData.json';

export interface ContractTemplateData {
  position: string;
  vendor: string;
  lot: string;
  approverName: string;
  custom: Record<string, string>;
}

export const EMPTY_TEMPLATE_DATA: ContractTemplateData = Object.freeze({
  position: '',
  vendor: '',
  lot: '',
  approverName: '',
  custom: Object.freeze({}) as Record<string, string>
}) as ContractTemplateData;

const KEY_RE = /^[A-Za-z0-9_-]+$/;

/** Parses "key: value" lines. Splits at the first colon; invalid keys are ignored; later duplicates win. */
export function parseTemplateFields(text: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) { return result; }
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) { continue; }
    const key = line.slice(0, idx).trim();
    if (!KEY_RE.test(key)) { continue; }
    result[key] = line.slice(idx + 1).trim();
  }
  return result;
}

export function demoTemplateData(contractId: number): ContractTemplateData {
  const fixtures = templateJson as unknown as Record<string, ContractTemplateData>;
  const found = fixtures[String(contractId)];
  const src = found || EMPTY_TEMPLATE_DATA;
  return { ...src, custom: { ...src.custom } };
}
