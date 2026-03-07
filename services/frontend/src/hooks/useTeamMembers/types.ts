export interface TeamMemberDTO {
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly avatarUrl: string | null;
  readonly role: string;
  readonly joinedAt: string;
  readonly providers: ReadonlyArray<{
    readonly provider: string;
    readonly username: string | null;
  }>;
}
