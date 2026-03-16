export interface ScrollFadeInResult {
  readonly ref: React.RefObject<HTMLElement | null>;
  readonly isVisible: boolean;
  readonly fadeClass: string;
}
