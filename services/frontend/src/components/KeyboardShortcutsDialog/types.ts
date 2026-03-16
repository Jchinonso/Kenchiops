export interface ShortcutGroup {
  readonly label: string;
  readonly shortcuts: ReadonlyArray<{ readonly key: string; readonly description: string }>;
}
