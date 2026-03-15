export interface FetchState<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

export interface UseFetchResult<T> extends FetchState<T> {
  readonly refetch: () => void;
}

export interface MutationState {
  readonly isLoading: boolean;
  readonly error: string | null;
}
