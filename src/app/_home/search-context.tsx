'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type SearchState = {
  /** The query the agenda is filtered by (the search box commits it, debounced). */
  query: string;
  setQuery: (query: string) => void;
};

const SearchContext = createContext<SearchState>({ query: '', setQuery: () => {} });

/**
 * Shares the home page's search query between the search box in the hero and the agenda further
 * down. Only this thin provider is a Client Component: the sections it wraps are passed through
 * as children and stay Server Components.
 */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export const useSearch = () => useContext(SearchContext);
