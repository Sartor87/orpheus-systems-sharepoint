import * as React from 'react';
import { Log, FormDisplayMode } from '@microsoft/sp-core-library';
import { FormCustomizerContext } from '@microsoft/sp-listview-extensibility';

import styles from './ContractForm.module.scss';

export interface IContractFormProps {
  context: FormCustomizerContext;
  displayMode: FormDisplayMode;
  onSave: () => void;
  onClose: () => void;
}

const LOG_SOURCE: string = 'ContractForm';

export default class ContractForm extends React.Component<IContractFormProps> {
  public componentDidMount(): void {
    Log.info(LOG_SOURCE, 'React Element: ContractForm mounted');
  }

  public componentWillUnmount(): void {
    Log.info(LOG_SOURCE, 'React Element: ContractForm unmounted');
  }

  public render(): React.ReactElement<IContractFormProps> {
    return <div className={styles.contractForm} />;
  }
}
