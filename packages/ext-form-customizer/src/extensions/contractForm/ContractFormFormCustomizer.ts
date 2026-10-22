import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FormDisplayMode, Log } from '@microsoft/sp-core-library';
import { BaseFormCustomizer } from '@microsoft/sp-listview-extensibility';
import { spfi, SPFx } from '@pnp/sp';
import type { SPFI } from '@pnp/sp';
import type { IPeoplePickerContext } from '@pnp/spfx-controls-react/lib/PeoplePicker';

import ContractForm, { ContractFormMode, IContractFormProps } from './components/ContractForm';
import { DEFAULT_CALENDAR_PAGE_URL } from './links';

/** ClientSideComponentProperties of the form customizer. */
export interface IContractFormFormCustomizerProperties {
  /** Regular expression for ContractCode; default `^\d{4}-[A-Za-z]+(-[A-Za-z]+)*$`. */
  codePattern?: string;
  /** Country preset on new contracts; default 'BG'. */
  defaultCountry?: string;
  /** Calendar page (web-relative, server-relative or absolute); default 'SitePages/ContractCalendar.aspx'. */
  calendarPageUrl?: string;
}

const LOG_SOURCE: string = 'ContractFormFormCustomizer';
const DEFAULT_CODE_PATTERN = '^\\d{4}-[A-Za-z]+(-[A-Za-z]+)*$';
const DEFAULT_COUNTRY = 'BG';

function toMode(m: FormDisplayMode): ContractFormMode {
  if (m === FormDisplayMode.New) { return 'new'; }
  return m === FormDisplayMode.Edit ? 'edit' : 'display';
}

/** New / Edit / Display form for the Contracts list (Orpheus Contract content type). */
export default class ContractFormFormCustomizer
  extends BaseFormCustomizer<IContractFormFormCustomizerProperties> {

  private _sp: SPFI | undefined;

  public onInit(): Promise<void> {
    Log.info(LOG_SOURCE, `Contract form, display mode ${this.displayMode}`);
    this._sp = spfi().using(SPFx(this.context));
    return Promise.resolve();
  }

  public render(): void {
    const p = this.properties || {};
    const web = this.context.pageContext.web;
    const props: IContractFormProps = {
      mode: toMode(this.displayMode),
      sp: this._sp as SPFI,
      listId: this.context.list.guid.toString(),
      itemId: this.context.itemId,
      codePattern: p.codePattern || DEFAULT_CODE_PATTERN,
      defaultCountry: p.defaultCountry || DEFAULT_COUNTRY,
      webUrl: web.absoluteUrl,
      calendarPageUrl: p.calendarPageUrl || DEFAULT_CALENDAR_PAGE_URL,
      // spfx-controls-react 3.x types against its own nested copy of the sp-http packages; at runtime both are
      // the page's single (externalised) SPFx instance, so only the declarations differ.
      peoplePickerContext: {
        absoluteUrl: web.absoluteUrl,
        msGraphClientFactory: this.context.msGraphClientFactory,
        spHttpClient: this.context.spHttpClient
      } as unknown as IPeoplePickerContext,
      userId: this.context.pageContext.legacyPageContext.userId as number,
      onSaved: this._onSave,
      onClosed: this._onClose
    };
    ReactDOM.render(React.createElement(ContractForm, props), this.domElement);
  }

  public onDispose(): void {
    ReactDOM.unmountComponentAtNode(this.domElement);
    super.onDispose();
  }

  private _onSave = (): void => {
    this.formSaved();
  };

  private _onClose = (): void => {
    this.formClosed();
  };
}
