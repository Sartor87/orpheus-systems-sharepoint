import type { SPFI } from '@pnp/sp';
import { IDataService, LocalDataService, UserInfo } from '@orpheussystems/shared-core';
import { SharePointDataService } from '@orpheussystems/shared-core/sharepoint';
import type { IContractCalendarWebPartProps } from './IContractCalendarWebPartProps';

/** `useLocalData` unset falls back to the debug flag: debug builds are local, shipped builds use SharePoint. */
export function isLocalData(props: Pick<IContractCalendarWebPartProps, 'useLocalData'>, isDebug: boolean): boolean {
  return props.useLocalData === true || (props.useLocalData === undefined && isDebug);
}

export function createDataService(
  props: IContractCalendarWebPartProps,
  sp: SPFI | undefined,
  isDebug: boolean,
  currentUser?: UserInfo
): IDataService {
  if (isLocalData(props, isDebug)) {
    return new LocalDataService({ demoUserId: props.demoUserId });
  }
  if (!props.contractsListId || !props.entriesListId || !props.holidaysListId) {
    throw new Error('Select the Contracts, Calendar entries and Holidays lists in the property pane');
  }
  if (!sp || !currentUser) {
    throw new Error('Current user is not resolved');
  }
  return new SharePointDataService(
    sp,
    {
      contractsListId: props.contractsListId,
      entriesListId: props.entriesListId,
      holidaysListId: props.holidaysListId
    },
    currentUser
  );
}

const REBUILD_PATHS = ['useLocalData', 'demoUserId', 'contractsListId', 'entriesListId', 'holidaysListId'];

/** Only data-source properties require a new service; display properties just re-render. */
export function requiresServiceRebuild(propertyPath: string): boolean {
  return REBUILD_PATHS.indexOf(propertyPath) !== -1;
}
