import * as React from 'react';
import type { IDataService } from '@orpheussystems/shared-core';
import type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

export interface IDataContext {
  service: IDataService;
  props: IContractCalendarWebPartProps;
}

export const DataContext = React.createContext<IDataContext>(undefined as unknown as IDataContext);
