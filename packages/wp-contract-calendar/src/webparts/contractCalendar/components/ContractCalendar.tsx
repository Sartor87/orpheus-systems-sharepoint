import * as React from 'react';
import { createTheme, MessageBar, MessageBarType, Spinner, SpinnerSize, ThemeProvider } from '@fluentui/react';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';
import styles from './ContractCalendar.module.scss';
import type { IContractCalendarProps } from './IContractCalendarProps';
import { useCalendarState } from './useCalendarState';
import ContractHeader from './ContractHeader';
import SelectionTypePicker from './SelectionTypePicker';
import StatsPanel from './StatsPanel';
import MonthGrid from './MonthGrid';
import OverlapDialog from './OverlapDialog';

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

const ContractCalendar: React.FC<IContractCalendarProps> = () => {
  const state = useCalendarState();
  const { selected, readOnly } = state;

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

      {state.error && (
        <MessageBar messageBarType={MessageBarType.error} isMultiline={false} className={styles.message}>
          {state.error}
        </MessageBar>
      )}
      {readOnly && selected && !state.loading && (
        <MessageBar messageBarType={MessageBarType.info} className={styles.message}>
          You are viewing {selected.contractor.displayName}&apos;s calendar. Only the contractor can mark days.
        </MessageBar>
      )}

      {state.loading && <Spinner size={SpinnerSize.large} label="Loading calendar…" className={styles.loading} />}

      {!state.loading && !selected && !state.error && (
        <MessageBar className={styles.message}>No active contracts to show.</MessageBar>
      )}

      {!state.loading && selected && (
        <div className={styles.months}>
          {state.months.map(m => (
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
              onDayClick={state.clickDay}
            />
          ))}
        </div>
      )}

      <OverlapDialog pending={state.pendingOverlap} selectionType={state.selectionType} onResolve={state.resolveOverlap} />
    </section>
  );
};

export default ContractCalendar;
