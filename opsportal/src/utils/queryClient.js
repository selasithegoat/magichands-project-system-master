import { QueryClient } from "@tanstack/react-query";

export const DEFAULT_QUERY_STALE_TIME_MS = 60_000;
export const DEFAULT_QUERY_GC_TIME_MS = 30 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
      retry: 1,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
