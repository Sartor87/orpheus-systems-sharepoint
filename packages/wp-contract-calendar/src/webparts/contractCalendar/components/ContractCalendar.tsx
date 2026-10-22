import * as React from 'react';
import { createTheme, MessageBar, MessageBarButton, MessageBarType, Spinner, SpinnerSize, ThemeProvider } from '@fluentui/react';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import { compareKeys, toDateKey } from '@orpheussystems/shared-core';
import styles from './ContractCalendar.module.scss';
import type { IContractCalendarProps } from './IContractCalendarProps';
import { useCalendarState } from './useCalendarState';
import ContractHeader from './ContractHeader';
import SelectionTypePicker from './SelectionTypePicker';
import StatsPanel from './StatsPanel';
import MonthGrid from './MonthGrid';
import OverlapDialog from './OverlapDialog';
import TimesheetDialog from './TimesheetDialog';
import { useRangeDrag } from './useRangeDrag';
import type { RangePreview } from './useRangeDrag';
import { rangeMode } from './rangeSelection';
import { showBrandToastOnce } from '@orpheussystems/shared-ui/toast';

const BRAND_TOAST_KEY = 'orpheus.contractCalendar.brandToastShownAt';

/** The part of the preview inside one month, or undefined when they do not meet. */
function clipToMonth(preview: RangePreview, year: number, month: number): RangePreview | undefined {
  const first = toDateKey(new Date(year, month - 1, 1));
  const last = toDateKey(new Date(year, month, 0));
  const from = compareKeys(preview.from, first) > 0 ? preview.from : first;
  const to = compareKeys(preview.to, last) < 0 ? preview.to : last;
  return compareKeys(from, to) <= 0 ? { from, to } : undefined;
}

/** Fluent controls inside the header card follow the Orpheus dark palette. */
const orpheusDark = createTheme({
  isInverted: true,
  defaultFontStyle: { fontFamily: orpheusTokens.fontStack },
  palette: {
    themePrimary: orpheusTokens.amber,
    themeLighterAlt: '#090704',
    themeLighter: '#241b09',
    themeLight: '#433212',
    themeTertiary: '#866423',
    themeSecondary: '#C59334',
    themeDarkAlt: '#E3B04D',
    themeDark: '#E8BD69',
    themeDarker: '#EECF92',
    neutralLighterAlt: '#1A1E24',
    neutralLighter: '#1F232A',
    neutralLight: orpheusTokens.border,
    neutralQuaternaryAlt: '#2C3038',
    neutralQuaternary: '#32363E',
    neutralTertiaryAlt: '#4A4F58',
    neutralTertiary: orpheusTokens.textMuted,
    neutralSecondaryAlt: '#B5BABF',
    neutralSecondary: '#B5BABF',
    neutralPrimaryAlt: '#D6D9DC',
    neutralPrimary: orpheusTokens.text,
    neutralDark: '#F7F7F7',
    black: '#FBFBFB',
    white: orpheusTokens.bgElevated
  }
});

const ContractCalendar: React.FC<IContractCalendarProps> = ({ brandToast }) => {
  React.useEffect(() => {
    if (brandToast) { showBrandToastOnce(BRAND_TOAST_KEY, 7); }
  }, [brandToast]);
  const state = useCalendarState();
  const { selected, readOnly } = state;
  const [timesheetOpen, setTimesheetOpen] = React.useState(false);
  const range = useRangeDrag({
    enabled: !readOnly && !state.loading && !state.loadError,
    resetKey: `${selected ? selected.id : 0}:${state.selectionType}`,
    isDayBlocked: state.isDayBlocked,
    modeAt: date => rangeMode(state.entries[date]?.type, state.selectionType),
    onClick: date => { state.clickDay(date).catch(() => undefined); },
    onRange: (dates, mode) => { state.applyRange(dates, mode).catch(() => undefined); }
  });
  const preview = range.preview;

  const rootStyle = {
    '--orpheus-amber': orpheusTokens.amber,
    '--orpheus-bg': orpheusTokens.bg,
    '--orpheus-bg-elevated': orpheusTokens.bgElevated,
    '--orpheus-text': orpheusTokens.text,
    '--orpheus-text-muted': orpheusTokens.textMuted,
    '--orpheus-border': orpheusTokens.border,
    fontFamily: orpheusTokens.fontStack
  } as React.CSSProperties;

  return (
    <section className={styles.contractCalendar} style={rootStyle}>
      <ThemeProvider theme={orpheusDark} className={styles.headerCard}>
        <ContractHeader
          contracts={state.contracts}
          selected={selected}
          currentUser={state.currentUser}
          readOnly={readOnly}
          onSelect={state.selectContract}
          onGenerateTimesheet={() => setTimesheetOpen(true)}
        />
        {selected && (
          <div className={styles.headerBottom}>
            {!readOnly && (
              <SelectionTypePicker value={state.selectionType} disabled={readOnly} onChange={state.setSelectionType} />
            )}
            <StatsPanel contract={selected} totals={state.totals} remaining={state.remaining} />
          </div>
        )}
      </ThemeProvider>

      {state.loadError && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          className={styles.message}
          actions={<MessageBarButton onClick={state.retryLoad}>Retry</MessageBarButton>}
        >
          Could not load the calendar: {state.loadError}
        </MessageBar>
      )}
      {readOnly && selected && !state.loading && !state.loadError && (
        <MessageBar messageBarType={MessageBarType.info} className={styles.message}>
          You are viewing {selected.contractor.displayName}&apos;s calendar. Only the contractor can mark days.
        </MessageBar>
      )}

      {state.loading && <Spinner size={SpinnerSize.large} label="Loading calendar…" className={styles.loading} />}

      {!state.loading && !selected && !state.loadError && (
        <MessageBar className={styles.message}>No active contracts to show.</MessageBar>
      )}

      {!state.loading && selected && !state.loadError && (
        <div ref={range.rootRef} className={range.dragging ? `${styles.months} ${styles.dragging}` : styles.months}>
          {state.months.map(m => {
            const clipped = preview && clipToMonth(preview, m.year, m.month);
            return (
              <MonthGrid
                key={`${m.year}-${m.month}`}
                year={m.year}
                month={m.month}
                contract={selected}
                entries={state.entries}
                holidays={state.holidays}
                readOnly={readOnly}
                today={state.today}
                isDayBlocked={state.isDayBlocked}
                dayHandlers={range.handlers}
                previewFrom={clipped?.from}
                previewTo={clipped?.to}
              />
            );
          })}
        </div>
      )}

      <OverlapDialog pending={state.pendingOverlap} selectionType={state.selectionType} onResolve={state.resolveOverlap} />
      {timesheetOpen && selected && (
        <TimesheetDialog
          key={selected.id}
          contract={selected}
          generating={state.generating}
          error={state.timesheetError}
          onClearError={state.clearTimesheetError}
          onGenerate={state.generateTimesheet}
          onDismiss={() => setTimesheetOpen(false)}
        />
      )}
    </section>
  );
};

export default ContractCalendar;
