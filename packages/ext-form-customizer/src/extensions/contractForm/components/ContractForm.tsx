import * as React from 'react';
import {
  DefaultButton,
  MessageBar,
  MessageBarButton,
  MessageBarType,
  PrimaryButton,
  Spinner,
  SpinnerSize,
  getId
} from '@fluentui/react';
import type { SPFI } from '@pnp/sp';
import type { IPeoplePickerContext } from '@pnp/spfx-controls-react/lib/PeoplePicker';
import type { Contract } from '@orpheussystems/shared-core';
import { showToast } from '@orpheussystems/shared-ui/toast';
import { orpheusBrand, orpheusMarkFrame, orpheusMarkPoints, orpheusMarkStrokeWidth, orpheusMarkViewBox } from '@orpheussystems/shared-ui/brand';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';

import { FieldErrors, findOverlaps, overlapNotice, validateContract } from '../formModel';
import { loadContract, loadOthersOfContractor, saveContract } from '../formService';
import { calendarLink } from '../links';
import {
  ContractFormFields,
  ContractFormView,
  FIELD_ORDER,
  FieldKey,
  FormValues,
  draftFromValues,
  formValuesFromContract,
  newFormValues
} from './ContractFormFields';
import styles from './ContractForm.module.scss';

export type ContractFormMode = 'new' | 'edit' | 'display';

export interface IContractFormProps {
  mode: ContractFormMode;
  sp: SPFI;
  listId: string;
  itemId?: number;
  codePattern: string;
  defaultCountry: string;
  webUrl: string;
  calendarPageUrl: string;
  peoplePickerContext: IPeoplePickerContext;
  /** After a successful save (the host calls formSaved). */
  onSaved(): void;
  /** Cancel / Close (the host calls formClosed). */
  onClosed(): void;
}

/** Delay before the other contracts of a newly picked contractor are fetched. */
const OVERLAP_DEBOUNCE_MS = 300;

type Load = { state: 'loading' } | { state: 'ready'; contract?: Contract } | { state: 'error'; message: string };

const cssVars = {
  '--orpheus-bg': orpheusTokens.bg,
  '--orpheus-text': orpheusTokens.text,
  '--orpheus-text-muted': orpheusTokens.textMuted,
  '--orpheus-border': orpheusTokens.border,
  '--orpheus-amber': orpheusTokens.amber,
  '--orpheus-font': orpheusTokens.fontStack
} as unknown as React.CSSProperties;

const amberButton = {
  root: { background: orpheusTokens.amber, borderColor: orpheusTokens.amber, color: orpheusTokens.bg },
  rootHovered: { background: orpheusTokens.amberHover, borderColor: orpheusTokens.amberHover, color: orpheusTokens.bg },
  rootPressed: { background: orpheusTokens.amberHover, borderColor: orpheusTokens.amberHover, color: orpheusTokens.bg }
};

const Mark: React.FC = () => (
  <svg width={20} height={20} viewBox={orpheusMarkViewBox} fill="none" stroke={orpheusTokens.amber}
    strokeWidth={orpheusMarkStrokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect {...orpheusMarkFrame} />
    <polyline points={orpheusMarkPoints} />
  </svg>
);

const ContractForm: React.FC<IContractFormProps> = props => {
  const { mode, sp, listId, itemId, codePattern, defaultCountry, webUrl, calendarPageUrl, peoplePickerContext, onSaved, onClosed } = props;
  const [ids] = React.useState(() => ({ prefix: getId('orpheus-contract'), heading: getId('orpheus-contract-heading') }));
  const [load, setLoad] = React.useState<Load>(() =>
    mode === 'new' ? { state: 'ready' }
      : itemId === undefined ? { state: 'error', message: 'The form was opened without an item id.' }
        : { state: 'loading' });
  const [values, setValues] = React.useState<FormValues>(() => newFormValues(defaultCountry));
  const [touched, setTouched] = React.useState<Partial<Record<FieldKey, true>>>({});
  const [showAll, setShowAll] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [others, setOthers] = React.useState<{ contractorId: number; list: Contract[] } | undefined>();
  const [dismissedNotice, setDismissedNotice] = React.useState<string | undefined>();

  const mounted = React.useRef(true);
  const othersCache = React.useRef(new Map<number, Promise<Contract[]>>());
  const formRef = React.useRef<HTMLFormElement>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const focusFirstError = React.useRef(false);

  React.useEffect(() => () => { mounted.current = false; }, []);

  // Edit / Display: load the item once.
  React.useEffect(() => {
    if (mode === 'new' || itemId === undefined) { return; }
    loadContract(sp, listId, itemId)
      .then(c => {
        if (!mounted.current) { return; }
        setValues(formValuesFromContract(c));
        setLoad({ state: 'ready', contract: c });
      })
      .catch((e: unknown) => {
        if (mounted.current) { setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) }); }
      });
  }, [mode, sp, listId, itemId]);

  const draft = React.useMemo(() => draftFromValues(values), [values]);
  const allErrors = React.useMemo(() => validateContract(draft, codePattern), [draft, codePattern]);
  const valid = Object.keys(allErrors).length === 0;
  const shownErrors = React.useMemo(() => {
    const out: FieldErrors = {};
    (Object.keys(allErrors) as FieldKey[]).forEach(k => { if (showAll || touched[k]) { out[k] = allErrors[k]; } });
    return out;
  }, [allErrors, showAll, touched]);

  const getOthers = React.useCallback((contractorId: number): Promise<Contract[]> => {
    let p = othersCache.current.get(contractorId);
    if (!p) {
      p = loadOthersOfContractor(sp, listId, contractorId).catch((e: unknown) => {
        // The notice is advisory: a failed lookup must not block saving.
        console.warn('Contract form: could not check overlapping contracts.', e);
        othersCache.current.delete(contractorId);
        return [] as Contract[];
      });
      othersCache.current.set(contractorId, p);
    }
    return p;
  }, [sp, listId]);

  // Overlap check once contractor and both dates are set (debounced; cached per contractor).
  const { contractorId, startDate, latestExecutionDate } = draft;
  React.useEffect(() => {
    if (mode === 'display' || load.state !== 'ready' || contractorId === undefined || !startDate || !latestExecutionDate) { return; }
    let cancelled = false;
    const t = setTimeout(() => {
      getOthers(contractorId).then(list => { if (!cancelled && mounted.current) { setOthers({ contractorId, list }); } })
        .catch(() => { /* getOthers never rejects */ });
    }, OVERLAP_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, load.state, contractorId, startDate, latestExecutionDate, getOthers]);

  const overlaps = React.useMemo(
    () => findOverlaps(draft, others && others.contractorId === draft.contractorId ? others.list : [], itemId),
    [draft, others, itemId]
  );
  const noticeText = overlapNotice(overlaps);
  const noticeKey = noticeText && `${overlaps.map(o => o.id).join(',')}|${draft.startDate}|${draft.latestExecutionDate}`;
  const noticeVisible = !!noticeText && dismissedNotice !== noticeKey;

  // After a save attempt on an invalid form: move focus to the first field with an error.
  React.useEffect(() => {
    if (!focusFirstError.current || !formRef.current) { return; }
    focusFirstError.current = false;
    const first = FIELD_ORDER.find(f => shownErrors[f]);
    const cell = first && formRef.current.querySelector(`[data-field="${first}"]`);
    const target = cell && cell.querySelector<HTMLElement>('input, [role="combobox"], button');
    if (target) { target.focus(); }
  });

  const revealErrors = (): void => {
    setShowAll(true);
    focusFirstError.current = true;
  };

  const onChange = React.useCallback((patch: Partial<FormValues>) => setValues(v => ({ ...v, ...patch })), []);
  const onTouch = React.useCallback((f: FieldKey) => setTouched(t => (t[f] ? t : { ...t, [f]: true })), []);

  const save = async (confirmedOverlap: boolean): Promise<void> => {
    if (saving) { return; }
    if (!valid) { revealErrors(); return; }
    const snapshot = draft;
    if (!confirmedOverlap && snapshot.contractorId !== undefined) {
      const list = await getOthers(snapshot.contractorId);
      if (!mounted.current) { return; }
      if (findOverlaps(snapshot, list, itemId).length > 0) {
        setOthers({ contractorId: snapshot.contractorId, list });
        setDismissedNotice(undefined);
        setTimeout(() => { if (noticeRef.current) { noticeRef.current.focus(); } }, 0);
        return;
      }
    }
    setSaving(true);
    try {
      await saveContract(sp, listId, snapshot, itemId);
      showToast({ kind: 'success', title: `Contract ${snapshot.title.trim()} saved` });
      onSaved();
    } catch (e) {
      showToast({ kind: 'error', title: 'The contract was not saved', text: e instanceof Error ? e.message : String(e) });
      if (mounted.current) { setSaving(false); }
    }
  };

  const loaded = load.state === 'ready' ? load.contract : undefined;
  const heading = mode === 'new' ? 'New contract'
    : loaded ? `${mode === 'edit' ? 'Edit contract' : 'Contract'} ${loaded.title}`
      : mode === 'edit' ? 'Edit contract' : 'Contract';

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (load.state === 'loading') {
    body = <Spinner size={SpinnerSize.large} label="Loading contract…" className={styles.status} />;
    footer = <DefaultButton text="Cancel" onClick={onClosed} />;
  } else if (load.state === 'error') {
    body = (
      <MessageBar messageBarType={MessageBarType.error} isMultiline className={styles.status}>
        The contract could not be loaded. {load.message}
      </MessageBar>
    );
    footer = <DefaultButton text="Close" onClick={onClosed} />;
  } else if (mode === 'display' && loaded) {
    body = <ContractFormView contract={loaded} />;
    footer = (
      <>
        <a className={styles.link} href={calendarLink(webUrl, calendarPageUrl, loaded.id)}>Open calendar</a>
        <DefaultButton text="Close" onClick={onClosed} />
      </>
    );
  } else {
    body = (
      <>
        {noticeVisible && (
          <div ref={noticeRef} tabIndex={-1} className={styles.notice}>
            <MessageBar
              messageBarType={MessageBarType.warning}
              isMultiline={false}
              actions={(
                <div>
                  <MessageBarButton onClick={() => { save(true).catch(() => undefined); }} disabled={saving}>Save anyway</MessageBarButton>
                  <MessageBarButton onClick={() => setDismissedNotice(noticeKey)}>Cancel</MessageBarButton>
                </div>
              )}
            >
              {noticeText}
            </MessageBar>
          </div>
        )}
        <ContractFormFields
          idPrefix={ids.prefix}
          values={values}
          errors={shownErrors}
          disabled={saving}
          peoplePickerContext={peoplePickerContext}
          onChange={onChange}
          onTouch={onTouch}
        />
      </>
    );
    footer = (
      <>
        {/* Save stays focusable while disabled (allowDisabledFocus); trying it reveals every field error. */}
        <span onClickCapture={() => { if (!valid && !saving) { revealErrors(); } }}>
          <PrimaryButton
            text={saving ? 'Saving…' : 'Save'}
            styles={amberButton}
            disabled={!valid || saving}
            allowDisabledFocus
            aria-describedby={!valid ? `${ids.prefix}-save-hint` : undefined}
            onClick={() => { save(false).catch(() => undefined); }}
          />
        </span>
        <DefaultButton text="Cancel" onClick={onClosed} disabled={saving} />
        {!valid && <span id={`${ids.prefix}-save-hint`} className={styles.hint}>Complete the required (*) fields correctly to save.</span>}
      </>
    );
  }

  return (
    <div className={styles.contractForm} style={cssVars}>
      <header className={styles.header}>
        <span className={styles.brand} title={orpheusBrand.name}><Mark /></span>
        <h1 id={ids.heading} className={styles.title}>{heading}</h1>
      </header>
      <form ref={formRef} className={styles.body} aria-labelledby={ids.heading} noValidate onSubmit={e => e.preventDefault()}>
        {body}
        <div className={styles.footer}>{footer}</div>
      </form>
    </div>
  );
};

export default ContractForm;
