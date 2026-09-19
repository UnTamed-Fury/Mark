export interface FaqEntry {
  readonly category: string;
  readonly label: string;
  readonly question: string;
  readonly answer: string;
}

export interface CooldownCheckResult {
  readonly onCooldown: boolean;
  readonly cooldownUntilMs: number;
}

export type PlatformType = 'discord' | 'fluxer';
