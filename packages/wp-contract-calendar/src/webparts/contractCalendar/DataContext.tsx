import * as React from 'react';
import type { IDataService } from '@orpheussystems/shared-core';
import type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';
import type { TimesheetTemplateSource } from './templateSource';

export interface IDataContext {
  service: IDataService;
  props: IContractCalendarWebPartProps;
  /** Set when `props.timesheetTemplateUrl` is configured. */
  templateSource?: TimesheetTemplateSource;
}

export const DataContext = React.createContext<IDataContext>(undefined as unknown as IDataContext);
