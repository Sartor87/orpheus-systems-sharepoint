import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Log } from '@microsoft/sp-core-library';
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName
} from '@microsoft/sp-application-base';
import { spfi, SPFx } from '@pnp/sp';
import type { Role } from '@orpheussystems/shared-core';

import * as strings from 'OrpheusChromeApplicationCustomizerStrings';
import type { IOrpheusChromeProperties } from './IOrpheusChromeProperties';
import { resolveMenu } from './menu';
import { loadRoles } from './chromeRoles';
import { announceOrpheus } from './chromeBrand';
import OrpheusHeader from './components/OrpheusHeader';
import OrpheusFooter from './components/OrpheusFooter';

const LOG_SOURCE: string = 'OrpheusChromeApplicationCustomizer';
const DEFAULT_CONTRACTS_LIST_URL = 'Lists/Contracts';

/** Orpheus Systems header (Top placeholder) and footer (Bottom placeholder). */
export default class OrpheusChromeApplicationCustomizer extends BaseApplicationCustomizer<IOrpheusChromeProperties> {
  private _top: PlaceholderContent | undefined;
  private _bottom: PlaceholderContent | undefined;
  /** Until the lookup finishes: no roles, so the header shows the brand and role-less items straight away. */
  private _roles: Role[] = [];
  private _disposed = false;

  public onInit(): Promise<void> {
    Log.info(LOG_SOURCE, `Initialized ${strings.Title}`);

    // Placeholders can arrive after onInit and are recreated on SPA navigation.
    this.context.placeholderProvider.changedEvent.add(this, this._render);
    // Same component instance across SPA navigation: re-render for the current page's aria-current.
    this.context.application.navigatedEvent.add(this, this._render);
    this._render();

    announceOrpheus();

    const sp = spfi().using(SPFx(this.context));
    const userId = this.context.pageContext.legacyPageContext.userId as number;
    loadRoles(sp, this.properties.contractsListUrl || DEFAULT_CONTRACTS_LIST_URL, userId)
      .then(roles => {
        if (this._disposed) { return; }
        this._roles = roles;
        this._render();
      })
      .catch(() => { /* loadRoles never rejects */ });

    return Promise.resolve();
  }

  protected onDispose(): void {
    this._disposed = true;
    this.context.placeholderProvider.changedEvent.remove(this, this._render);
    this.context.application.navigatedEvent.remove(this, this._render);
    this._unmount(this._top);
    this._unmount(this._bottom);
    this._top = undefined;
    this._bottom = undefined;
    super.onDispose();
  }

  // Arrow property: a stable reference for SPFx event add/remove, with `this` bound.
  private _render = (): void => {
    if (this._disposed) { return; }
    const names = this.context.placeholderProvider.placeholderNames;

    if (names.indexOf(PlaceholderName.Top) !== -1) {
      if (!this._top) {
        this._top = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Top, {
          onDispose: content => this._onPlaceholderDisposed(content)
        });
      }
      if (this._top) {
        const items = resolveMenu(this.properties, this.context.pageContext.web.absoluteUrl);
        this._mount(this._top, React.createElement(OrpheusHeader, { items, roles: this._roles, currentPath: window.location.pathname }));
      }
    }

    if (this.properties.showFooter !== false && names.indexOf(PlaceholderName.Bottom) !== -1) {
      if (!this._bottom) {
        this._bottom = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Bottom, {
          onDispose: content => this._onPlaceholderDisposed(content)
        });
      }
      if (this._bottom) {
        this._mount(this._bottom, React.createElement(OrpheusFooter, { version: this.manifest.version }));
      }
    }
  };

  /** SharePoint disposed a placeholder (e.g. on navigation): release its React root so it can be recreated. */
  private _onPlaceholderDisposed(content: PlaceholderContent): void {
    this._unmount(content);
    if (content === this._top) { this._top = undefined; }
    if (content === this._bottom) { this._bottom = undefined; }
  }

  private _mount(content: PlaceholderContent, element: React.ReactElement): void {
    ReactDom.render(element, content.domElement);
  }

  private _unmount(content: PlaceholderContent | undefined): void {
    if (content && content.domElement) { ReactDom.unmountComponentAtNode(content.domElement); }
  }
}
