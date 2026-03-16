export interface FullAnalysisDependencyChange {
  readonly name: string;
  readonly type: string;
  readonly oldVersion?: string | null;
  readonly newVersion?: string | null;
  readonly ecosystem?: string | null;
}

export interface FullAnalysisBuildConfigChange {
  readonly file: string;
  readonly changeType?: string | null;
  readonly summary: string;
}

export interface FullAnalysisAction {
  readonly description: string;
  readonly priority?: string | number;
  readonly actionType?: string;
}
