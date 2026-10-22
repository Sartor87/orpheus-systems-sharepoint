import * as React from 'react';
import { DatePicker, DayOfWeek, Dropdown, IDropdownOption, TextField } from '@fluentui/react';
import { PeoplePicker, PrincipalType } from '@pnp/spfx-controls-react/lib/PeoplePicker';
import type { IPeoplePickerContext } from '@pnp/spfx-controls-react/lib/PeoplePicker';
import { fromDateKey, toDateKey } from '@orpheussystems/shared-core';
import type { Contract, ContractStatus, DateKey, Modality } from '@orpheussystems/shared-core';
import type { ContractDraft, FieldErrors } from '../formModel';
import styles from './ContractForm.module.scss';

export type FieldKey = keyof ContractDraft;

export interface PersonValue {
  id: number;
  name: string;
  /** Email or login name; what the picker resolves as its default selection. */
  key: string;
}

/** What the inputs hold: numbers stay strings while typed, people keep their display data. */
export interface FormValues {
  title: string;
  contractCode: string;
  frameworkContract: string;
  modality?: Modality;
  contractor?: PersonValue;
  contractManager?: PersonValue;
  startDate?: DateKey;
  latestExecutionDate?: DateKey;
  onSiteTargetDays: string;
  offSiteTargetDays: string;
  hoursPerDay: string;
  country: string;
  status: ContractStatus;
}

/** Visual order; also the order the first invalid field is chosen in. */
export const FIELD_ORDER: FieldKey[] = [
  'title', 'contractCode', 'frameworkContract', 'modality', 'contractorId', 'contractManagerId',
  'startDate', 'latestExecutionDate', 'onSiteTargetDays', 'offSiteTargetDays', 'hoursPerDay', 'country', 'status'
];

export const DEFAULT_HOURS_PER_DAY = 8;
export const FALLBACK_COUNTRY = 'BG';

export function newFormValues(defaultCountry: string): FormValues {
  return {
    title: '',
    contractCode: '',
    frameworkContract: '',
    onSiteTargetDays: '',
    offSiteTargetDays: '',
    hoursPerDay: String(DEFAULT_HOURS_PER_DAY),
    country: (defaultCountry || FALLBACK_COUNTRY).trim().toUpperCase(),
    status: 'Active'
  };
}

function personValue(u: Contract['contractor']): PersonValue | undefined {
  // An empty person column maps to id 0: treat it as missing so validation asks for it.
  return u.id ? { id: u.id, name: u.displayName, key: u.email || u.loginName } : undefined;
}

export function formValuesFromContract(c: Contract): FormValues {
  return {
    title: c.title || '',
    contractCode: c.contractCode || '',
    frameworkContract: c.frameworkContract || '',
    modality: c.modality || undefined,
    contractor: personValue(c.contractor),
    contractManager: personValue(c.contractManager),
    startDate: c.startDate || undefined,
    latestExecutionDate: c.latestExecutionDate || undefined,
    onSiteTargetDays: String(c.onSiteTargetDays),
    offSiteTargetDays: String(c.offSiteTargetDays),
    hoursPerDay: String(c.hoursPerDay),
    country: c.country || '',
    status: c.status || 'Active'
  };
}

function parseNumber(s: string): number | undefined {
  const t = s.trim().replace(',', '.');
  return t === '' ? undefined : Number(t);
}

export function draftFromValues(v: FormValues): ContractDraft {
  return {
    title: v.title,
    contractCode: v.contractCode,
    frameworkContract: v.frameworkContract,
    modality: v.modality,
    contractorId: v.contractor && v.contractor.id,
    contractManagerId: v.contractManager && v.contractManager.id,
    startDate: v.startDate,
    latestExecutionDate: v.latestExecutionDate,
    onSiteTargetDays: parseNumber(v.onSiteTargetDays),
    offSiteTargetDays: parseNumber(v.offSiteTargetDays),
    hoursPerDay: parseNumber(v.hoursPerDay),
    country: v.country.trim(),
    status: v.status
  };
}

const EMPTY: string[] = [];
const MODALITIES: Modality[] = ['On-site', 'Off-site', 'Hybrid'];
const STATUSES: ContractStatus[] = ['Draft', 'Active', 'Closed'];
const options = (values: string[]): IDropdownOption[] => values.map(v => ({ key: v, text: v }));

const formatDate = (d?: Date): string => (d ? toDateKey(d) : '');

/** yyyy-MM-dd, or d.M.yyyy / d/M/yyyy as typed locally. Never goes through UTC. Null = unreadable (Fluent's contract). */
// eslint-disable-next-line @rushstack/no-new-null
export function parseDateInput(s: string): Date | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

interface PersonItem { id?: string | number; text?: string; secondaryText?: string; loginName?: string }

function toPerson(items: PersonItem[]): PersonValue | undefined {
  const p = items[0];
  const id = p ? Number(p.id) : NaN;
  if (!p || !Number.isFinite(id) || id <= 0) { return undefined; }
  return { id, name: p.text || '', key: p.secondaryText || p.loginName || '' };
}

export interface IContractFormFieldsProps {
  idPrefix: string;
  values: FormValues;
  /** Only the errors to show (touched fields, or all after a save attempt). */
  errors: FieldErrors;
  disabled: boolean;
  /**
   * People to pre-select, from the loaded item only. Kept stable after mount: the picker owns its selection, and a
   * changing value would make it re-resolve (a stale lookup could then show a different person than the form holds).
   */
  initialPeople: { contractor?: string; contractManager?: string };
  peoplePickerContext: IPeoplePickerContext;
  onChange(patch: Partial<FormValues>): void;
  onTouch(field: FieldKey): void;
}

/** The editable fields (New / Edit). */
export const ContractFormFields: React.FC<IContractFormFieldsProps> = props => {
  const { idPrefix, values, errors, disabled, initialPeople, peoplePickerContext, onChange, onTouch } = props;
  const id = (f: FieldKey): string => `${idPrefix}-${f}`;

  /** Wraps a field; leaving it (focusout bubbles in React 17) marks it touched. */
  const cell = (f: FieldKey, child: React.ReactNode): React.ReactNode => (
    <div key={f} className={styles.cell} data-field={f} onBlur={() => onTouch(f)}>
      {child}
    </div>
  );

  const text = (f: 'title' | 'contractCode' | 'frameworkContract' | 'country', label: string, extra?: object): React.ReactNode =>
    cell(f, (
      <TextField
        id={id(f)}
        label={label}
        value={values[f]}
        errorMessage={errors[f]}
        disabled={disabled}
        onChange={(_e, v) => onChange({ [f]: f === 'country' ? (v || '').toUpperCase() : v || '' } as Partial<FormValues>)}
        {...extra}
      />
    ));

  const num = (f: 'onSiteTargetDays' | 'offSiteTargetDays' | 'hoursPerDay', label: string, required: boolean): React.ReactNode =>
    cell(f, (
      <TextField
        id={id(f)}
        label={label}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        required={required}
        value={values[f]}
        errorMessage={errors[f]}
        disabled={disabled}
        onChange={(_e, v) => onChange({ [f]: v || '' } as Partial<FormValues>)}
      />
    ));

  const date = (f: 'startDate' | 'latestExecutionDate', label: string): React.ReactNode => {
    const v = values[f];
    const error = errors[f];
    return cell(f, (
      <DatePicker
        id={id(f)}
        label={label}
        isRequired
        allowTextInput
        disabled={disabled}
        firstDayOfWeek={DayOfWeek.Monday}
        placeholder="yyyy-mm-dd"
        value={v ? fromDateKey(v) : undefined}
        formatDate={formatDate}
        parseDateFromString={parseDateInput}
        onSelectDate={d => onChange({ [f]: d ? toDateKey(d) : undefined } as Partial<FormValues>)}
        // Our message wins when there is one; otherwise the picker's own (e.g. an unreadable date) shows.
        textField={error ? { errorMessage: error } : undefined}
      />
    ));
  };

  const person = (f: 'contractorId' | 'contractManagerId', key: 'contractor' | 'contractManager', label: string): React.ReactNode =>
    cell(f, (
      <PeoplePicker
        context={peoplePickerContext}
        titleText={label}
        personSelectionLimit={1}
        principalTypes={[PrincipalType.User]}
        ensureUser
        required
        disabled={disabled}
        resolveDelay={300}
        defaultSelectedUsers={initialPeople[key] ? [initialPeople[key] as string] : EMPTY}
        errorMessage={errors[f]}
        onChange={items => onChange({ [key]: toPerson(items as PersonItem[]) } as Partial<FormValues>)}
      />
    ));

  const choice = (f: 'modality' | 'status', label: string, all: string[], required: boolean): React.ReactNode =>
    cell(f, (
      <Dropdown
        id={id(f)}
        label={label}
        required={required}
        placeholder="Select…"
        options={options(all)}
        selectedKey={values[f] || null}
        errorMessage={errors[f]}
        disabled={disabled}
        onChange={(_e, o) => onChange({ [f]: o ? (o.key as string) : undefined } as Partial<FormValues>)}
      />
    ));

  return (
    <div className={styles.grid}>
      {text('title', 'Title', { required: true, autoComplete: 'off' })}
      {text('contractCode', 'Contract code', { required: true, autoComplete: 'off', placeholder: '1185-Name' })}
      {text('frameworkContract', 'Framework contract', { autoComplete: 'off' })}
      {choice('modality', 'Modality', MODALITIES, false)}
      {person('contractorId', 'contractor', 'Contractor')}
      {person('contractManagerId', 'contractManager', 'Contract manager')}
      {date('startDate', 'Start date')}
      {date('latestExecutionDate', 'Latest execution date')}
      {num('onSiteTargetDays', 'On-site target days', true)}
      {num('offSiteTargetDays', 'Off-site target days', true)}
      {num('hoursPerDay', 'Hours per day', false)}
      {text('country', 'Country', { required: true, maxLength: 2, autoComplete: 'country', placeholder: 'BG' })}
      {choice('status', 'Status', STATUSES, true)}
    </div>
  );
};

const show = (v: string | number | undefined): string => (v === undefined || v === '' ? '—' : String(v));

/** Display mode: the same layout as a read-only description list. */
export const ContractFormView: React.FC<{ contract: Contract }> = ({ contract: c }) => {
  const rows: Array<[string, string]> = [
    ['Title', show(c.title)],
    ['Contract code', show(c.contractCode)],
    ['Framework contract', show(c.frameworkContract)],
    ['Modality', show(c.modality)],
    ['Contractor', show(c.contractor.displayName)],
    ['Contract manager', show(c.contractManager.displayName)],
    ['Start date', show(c.startDate)],
    ['Latest execution date', show(c.latestExecutionDate)],
    ['On-site target days', show(c.onSiteTargetDays)],
    ['Off-site target days', show(c.offSiteTargetDays)],
    ['Hours per day', show(c.hoursPerDay)],
    ['Country', show(c.country)],
    ['Status', show(c.status)]
  ];
  return (
    <dl className={`${styles.grid} ${styles.view}`}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.cell}>
          <dt className={styles.viewLabel}>{label}</dt>
          <dd className={styles.viewValue}>{value}</dd>
        </div>
      ))}
    </dl>
  );
};
