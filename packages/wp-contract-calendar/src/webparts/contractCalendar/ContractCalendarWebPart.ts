import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  type IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneLabel,
  PropertyPaneLink,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';
import { MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import { PropertyFieldListPicker, PropertyFieldListPickerOrderBy } from '@pnp/spfx-property-controls/lib/PropertyFieldListPicker';
import { spfi, SPFI } from '@pnp/sp';
import { SPFx } from '@pnp/sp/behaviors/spfx';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { IDataService, LocalDataService, UserInfo, UserRef } from '@orpheussystems/shared-core';
import { deriveRoles } from '@orpheussystems/shared-core/sharepoint';
import { orpheusBrand } from '@orpheussystems/shared-ui/brand';
import { orpheusTokens } from '@orpheussystems/shared-ui/tokens';

import * as strings from 'ContractCalendarWebPartStrings';
import ContractCalendar from './components/ContractCalendar';
import { DataContext } from './DataContext';
import { createDataService, isLocalData, requiresServiceRebuild } from './createDataService';
import { filterListsByContentType, IListWithContentTypes } from './filterListsByContentType';
import type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

export type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

declare const DEBUG: boolean;

let bannerShown = false;

const CT_CONTRACT = 'Orpheus Contract';
const CT_ENTRY = 'Orpheus Calendar Entry';
const CT_HOLIDAY = 'Orpheus Holiday';

export default class ContractCalendarWebPart extends BaseClientSideWebPart<IContractCalendarWebPartProps> {

  private _isDarkTheme: boolean = false;
  private _service: IDataService | undefined;
  private _error: string | undefined;
  private _sp: SPFI | undefined;
  private _currentUser: UserInfo | undefined;
  private _initialContractId: number | undefined;
  private _buildToken: number = 0;
  private _hasBuilt: boolean = false;
  private _rolesKey: string | undefined;
  private _basicUser: UserRef | undefined;
  private _listsWithCts: Promise<IListWithContentTypes[] | undefined> | undefined;

  private get _isDebug(): boolean {
    return typeof DEBUG !== 'undefined' && DEBUG;
  }

  private get _isLocal(): boolean {
    return isLocalData(this.properties, this._isDebug);
  }

  public render(): void {
    let element: React.ReactElement;
    if (this._service) {
      element = React.createElement(
        DataContext.Provider,
        { value: { service: this._service, props: { ...this.properties, initialContractId: this._initialContractId } } },
        React.createElement(ContractCalendar, { isDarkTheme: this._isDarkTheme, brandToast: true })
      );
    } else if (!this._hasBuilt) {
      element = React.createElement(Spinner);
    } else {
      element = React.createElement(
        MessageBar,
        { messageBarType: MessageBarType.error },
        this._error || strings.ServiceUnavailable
      );
    }
    ReactDom.render(element, this.domElement);
  }

  protected async onInit(): Promise<void> {
    const raw = new URLSearchParams(window.location.search).get('contractId');
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    this._initialContractId = isNaN(parsed) ? undefined : parsed;
    if (!bannerShown && (typeof process === 'undefined' || process.env.NODE_ENV !== 'test')) {
      bannerShown = true;
      console.info(
        `%c ${orpheusBrand.name} %c Contract Calendar v${this.manifest.version} — ${orpheusBrand.url}`,
        `background:${orpheusTokens.amber};color:${orpheusTokens.bg};font-weight:600;border-radius:3px`,
        `color:${orpheusTokens.textMuted}`
      );
    }
    await this._buildService();
  }

  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: unknown, newValue: unknown): void {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    if (!requiresServiceRebuild(propertyPath)) {
      this.render();
      return;
    }
    this._buildService().then(() => this.render(), () => this.render());
  }

  /** Only the latest build may publish its result; the previous service stays until then. */
  private async _buildService(): Promise<void> {
    const token = ++this._buildToken;
    let service: IDataService | undefined;
    let error: string | undefined;
    try {
      if (this._isLocal) {
        service = createDataService(this.properties, undefined, this._isDebug);
      } else {
        const lists = {
          contractsListId: this.properties.contractsListId,
          entriesListId: this.properties.entriesListId,
          holidaysListId: this.properties.holidaysListId
        };
        if (!lists.contractsListId || !lists.entriesListId || !lists.holidaysListId) {
          // createDataService throws the configuration message.
          service = createDataService(this.properties, undefined, this._isDebug);
        } else {
          const sp = this._getSp();
          if (!this._basicUser) {
            const u = await sp.web.currentUser();
            this._basicUser = { id: u.Id, loginName: u.LoginName, displayName: u.Title, email: u.Email };
          }
          const key = [lists.contractsListId, lists.entriesListId, lists.holidaysListId].join('|');
          let user = this._currentUser;
          if (!user || this._rolesKey !== key) {
            const roles = await deriveRoles(sp, lists, this._basicUser.id);
            user = { ...this._basicUser, roles };
            if (token === this._buildToken) {
              this._currentUser = user;
              this._rolesKey = key;
            }
          }
          service = createDataService(this.properties, sp, this._isDebug, user);
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    if (token !== this._buildToken) { return; }
    this._service = service;
    this._error = error;
    this._hasBuilt = true;
  }

  private _getSp(): SPFI {
    if (!this._sp) {
      this._sp = spfi().using(SPFx(this.context));
    }
    return this._sp;
  }

  /** One request for all lists with their content types; undefined if it fails. */
  private _getListsWithContentTypes(): Promise<IListWithContentTypes[] | undefined> {
    if (!this._listsWithCts) {
      this._listsWithCts = (async () => {
        try {
          return await this._getSp().web.lists
            .select('Id', 'Title', 'ContentTypes/Name')
            .expand('ContentTypes')
            .filter('BaseTemplate eq 100')() as unknown as IListWithContentTypes[];
        } catch (e) {
          console.warn('Could not filter lists by content type; showing all lists.', e);
          return undefined;
        }
      })();
    }
    return this._listsWithCts;
  }

  private _listPicker(targetProperty: string, label: string, contentTypeName: string): IPropertyPaneField<unknown> {
    return PropertyFieldListPicker(targetProperty, {
      label,
      selectedList: (this.properties as unknown as Record<string, string>)[targetProperty],
      baseTemplate: 100,
      includeHidden: false,
      orderBy: PropertyFieldListPickerOrderBy.Title,
      disabled: false,
      onPropertyChange: this.onPropertyPaneFieldChanged.bind(this),
      properties: this.properties,
      // property-controls resolves its own copy of sp-component-base, so the private members differ
      context: this.context as never,
      deferredValidationTime: 0,
      key: targetProperty + 'Field',
      onListsRetrieved: async lists => {
        try {
          const withCts = await this._getListsWithContentTypes();
          return filterListsByContentType(lists, withCts, contentTypeName);
        } catch (e) {
          console.warn('Could not filter lists by content type; showing all lists.', e);
          return lists;
        }
      }
    });
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    this._isDarkTheme = !!currentTheme.isInverted;
    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const local = this._isLocal;
    const dataFields: IPropertyPaneField<unknown>[] = [
      PropertyPaneToggle('useLocalData', {
        label: strings.UseLocalDataLabel,
        checked: local
      })
    ];
    if (local) {
      dataFields.push(PropertyPaneDropdown('demoUserId', {
        label: strings.DemoUserLabel,
        options: LocalDataService.demoUsers.map(u => ({ key: u.id, text: u.displayName })),
        selectedKey: this.properties.demoUserId
      }));
    } else {
      dataFields.push(
        this._listPicker('contractsListId', strings.ContractsListLabel, CT_CONTRACT),
        this._listPicker('entriesListId', strings.EntriesListLabel, CT_ENTRY),
        this._listPicker('holidaysListId', strings.HolidaysListLabel, CT_HOLIDAY)
      );
    }

    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            { groupName: strings.DataGroupName, groupFields: dataFields },
            {
              groupName: strings.DisplayGroupName,
              groupFields: [
                PropertyPaneSlider('monthsToShow', {
                  label: strings.MonthsToShowLabel,
                  min: 0,
                  max: 12,
                  step: 1,
                  showValue: true
                }),
                PropertyPaneToggle('blockWeekends', { label: strings.BlockWeekendsLabel })
              ]
            },
            {
              groupName: strings.TimesheetGroupName,
              groupFields: [
                PropertyPaneTextField('approvingOrgLabel', { label: strings.ApprovingOrgLabel }),
                PropertyPaneTextField('serviceProviderLabel', { label: strings.ServiceProviderLabel })
              ]
            },
            {
              groupName: strings.AboutGroupName,
              groupFields: [
                PropertyPaneLabel('aboutVersion', { text: `${strings.AboutVersionLabel} ${this.manifest.version}` }),
                PropertyPaneLabel('aboutBuiltBy', { text: strings.AboutBuiltByLabel }),
                PropertyPaneLink('aboutWebsite', { text: strings.AboutWebsiteLabel, href: orpheusBrand.url, target: '_blank' }),
                PropertyPaneLink('aboutContact', { text: strings.AboutContactLabel, href: `mailto:${orpheusBrand.contactEmail}` }),
                PropertyPaneLabel('aboutLicense', { text: strings.AboutLicenseLabel })
              ]
            }
          ]
        }
      ]
    };
  }
}
