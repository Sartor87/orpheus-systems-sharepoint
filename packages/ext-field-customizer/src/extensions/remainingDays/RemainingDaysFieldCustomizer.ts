import { BaseFieldCustomizer, type IFieldCustomizerCellEventParameters } from '@microsoft/sp-listview-extensibility';

export default class RemainingDaysFieldCustomizer extends BaseFieldCustomizer<Record<string, never>> {
  public onRenderCell(event: IFieldCustomizerCellEventParameters): void {
    event.domElement.textContent = '—';
  }

  public onDisposeCell(event: IFieldCustomizerCellEventParameters): void {
    super.onDisposeCell(event);
  }
}
