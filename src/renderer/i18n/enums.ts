import { t } from './index';

export function workerModeLabel(mode: string | null | undefined): string {
  if (!mode) return t('status.unknown');
  const key = `enums.workerMode.${mode}`;
  const label = t(key);
  return label === key ? mode : label;
}

export function termTypeLabel(type: string): string {
  const key = `enums.termType.${type}`;
  const label = t(key);
  return label === key ? type : label;
}

export function termScopeLabel(scope: string): string {
  const key = `enums.termScope.${scope}`;
  const label = t(key);
  return label === key ? scope : label;
}

export function termStatusLabel(status: string): string {
  const key = `enums.termStatus.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function characterStatusLabel(status: string): string {
  const key = `enums.characterStatus.${status}`;
  const label = t(key);
  return label === key ? status : label;
}
