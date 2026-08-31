import type { ProviderConcurrencyKind } from '@shared/constants/concurrency-policy';
import type { AiExecutionTarget } from '../ai/execution-target';

export function providerKindForTarget(
  target: AiExecutionTarget,
): ProviderConcurrencyKind {
  return target.providerType;
}
