'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type SearchState = {
  /** The query the events view is filtered by (the search box commits it, debounced). */
  query: string;
  setQuery: (query: string) => void;
};

const SearchContext = createContext<SearchState>({ query: '', setQuery: () => {} });

/**
 * Shares the active search query between the search box and the events catalog.
 * Only this thin provider is a Client Component: child sections stay Server Components.
 */
export function SearchProvider({ initialQuery = '', children }: { initialQuery?: string; children: ReactNode }) {
  const [query, setQuery] = useState(initialQuery);
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export const useSearch = () => useContext(SearchContext);
