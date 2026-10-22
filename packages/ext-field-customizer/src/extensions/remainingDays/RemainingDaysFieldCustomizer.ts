import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { BaseFieldCustomizer, type IFieldCustomizerCellEventParameters } from '@microsoft/sp-listview-extensibility';
import { remainingBars } from './bars';
import RemainingBars from './components/RemainingBars';

/**
 * Renders remaining on-site/off-site days bars from the item's own values. The four columns must be in the view;
 * when they are not, getValueByName yields nothing and the cell shows a dash. No extra requests are made.
 */
export default class RemainingDaysFieldCustomizer extends BaseFieldCustomizer<Record<string, never>> {
  public onRenderCell(event: IFieldCustomizerCellEventParameters): void {
    const item = event.listItem;
    const bars = remainingBars({
      onSiteTarget: item.getValueByName('OnSiteTargetDays'),
      onSiteUsed: item.getValueByName('OnSiteUsedDays'),
      offSiteTarget: item.getValueByName('OffSiteTargetDays'),
      offSiteUsed: item.getValueByName('OffSiteUsedDays')
    });
    ReactDOM.render(React.createElement(RemainingBars, { bars }), event.domElement);
  }

  public onDisposeCell(event: IFieldCustomizerCellEventParameters): void {
    ReactDOM.unmountComponentAtNode(event.domElement);
    super.onDisposeCell(event);
  }
}
