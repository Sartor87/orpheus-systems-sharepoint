import { dismissToast, showToast } from './api';

/** Convenience for React components; the same functions as the module exports. */
export function useToasts(): { showToast: typeof showToast; dismissToast: typeof dismissToast } {
  return { showToast, dismissToast };
}
