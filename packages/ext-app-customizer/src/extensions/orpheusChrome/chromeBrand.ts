import { showBrandToastOnce } from '@orpheussystems/shared-ui/toast';

/**
 * The Orpheus Systems brand toast. Uses the default, site-wide storage key shared with every Orpheus component,
 * so a page with the header and the web part shows one toast per 7 days. Returns whether it was shown.
 */
export function announceOrpheus(): boolean {
  return showBrandToastOnce();
}
