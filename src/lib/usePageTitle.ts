import { useEffect } from 'react';
import { SITE } from '../config/site';

/** Sets the browser tab title (also what shared links and screen readers announce). */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} – ${SITE.shortName}` : SITE.shortName;
  }, [title]);
}
