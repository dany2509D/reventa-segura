import { cache } from 'react';
import { currentUser } from '../session';

/**
 * The signed-in member for the shell (header, tab bar, footer). Same lookup as `currentUser`,
 * memoised for the duration of one request so the three of them cost a single session query.
 * Presentation only: pages and actions keep doing their own authorization with session.ts.
 */
export const shellUser = cache(currentUser);
