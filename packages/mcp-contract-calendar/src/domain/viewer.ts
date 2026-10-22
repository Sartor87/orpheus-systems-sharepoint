import type { Contract } from '@orpheussystems/shared-core';
import type { Viewer } from './types';
export type { Viewer, AgentRole } from './types';

export const canBook = (v: Viewer): boolean => v.roles.includes('Contractor');

export const seesAll = (v: Viewer): boolean => v.roles.includes('HR') || v.roles.includes('Admin');

// A viewer without any role sees nothing (secure default).
export const isVisible = (v: Viewer, c: Contract): boolean =>
  v.roles.length > 0 &&
  (seesAll(v) || c.contractor.id === v.user.id || c.contractManager.id === v.user.id);
