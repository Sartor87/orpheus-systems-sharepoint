import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  type IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';
import { MessageBar, MessageBarType } from '@fluentui/react';
import { PropertyFieldListPicker, PropertyFieldListPickerOrderBy } from '@pnp/spfx-property-controls/lib/PropertyFieldListPicker';
import { spfi, SPFI } from '@pnp/sp';
import { SPFx } from '@pnp/sp/behaviors/spfx';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { IDataService, LocalDataService, UserInfo } from '@orpheussystems/shared-core';
import { deriveRoles } from '@orpheussystems/shared-core/sharepoint';

import * as strings from 'ContractCalendarWebPartStrings';
import ContractCalendar from './components/ContractCalendar';
import { DataContext } from './DataContext';
import { createDataService, isLocalData } from './createDataService';
import type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

export type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

declare const DEBUG: boolean;

interface IListWithContentTypes {
  Id: string;
  Title: string;
  ContentTypes: { Name: string }[];
}

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
        React.createElement(ContractCalendar, { isDarkTheme: this._isDarkTheme })
      );
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
    await this._buildService();
  }

  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: unknown, newValue: unknown): void {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    this._buildService().then(() => this.render(), () => this.render());
  }

  private async _buildService(): Promise<void> {
    this._service = undefined;
    this._error = undefined;
    try {
      if (this._isLocal) {
        this._service = createDataService(this.properties, undefined, this._isDebug);
        return;
      }
      const lists = {
        contractsListId: this.properties.contractsListId,
        entriesListId: this.properties.entriesListId,
        holidaysListId: this.properties.holidaysListId
      };
      if (!lists.contractsListId || !lists.entriesListId || !lists.holidaysListId) {
        // createDataService throws the configuration message.
        this._service = createDataService(this.properties, undefined, this._isDebug);
        return;
      }
      const sp = this._getSp();
      if (!this._currentUser) {
        const u = await sp.web.currentUser();
        const roles = await deriveRoles(sp, lists, u.Id);
        this._currentUser = {
          id: u.Id,
          loginName: u.LoginName,
          displayName: u.Title,
          email: u.Email,
          roles
        };
      }
      this._service = createDataService(this.properties, sp, this._isDebug, this._currentUser);
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e);
    }
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
            .select('Id', 'Title')
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
        const withCts = await this._getListsWithContentTypes();
        if (!withCts) { return lists; }
        const ok = new Set(
          withCts
            .filter(l => l.ContentTypes.some(ct => ct.Name === contentTypeName))
            .map(l => l.Id.toLowerCase())
        );
        return lists.filter(l => ok.has(l.Id.toLowerCase()));
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
            }
          ]
        }
      ]
    };
  }
}
