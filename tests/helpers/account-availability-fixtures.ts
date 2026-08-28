import type { AccountAvailabilityDto } from '@shared/schemas/account-availability';
import { availabilityToUiLane } from '@shared/utils/account-availability';
import type { AccountAvailability } from '@shared/constants/account-availability';

export function mockAccountAvailability(
  overrides: Partial<AccountAvailabilityDto> & { availability?: AccountAvailability } = {},
): AccountAvailabilityDto {
  const availability = overrides.availability ?? 'READY';
  return {
    availability,
    uiLane: overrides.uiLane ?? availabilityToUiLane(availability),
    reasonCode: overrides.reasonCode ?? null,
    usableForNewJob: overrides.usableForNewJob ?? availability === 'READY',
    schedulerEligible: overrides.schedulerEligible ?? availability === 'READY',
    canOpenBrowser: overrides.canOpenBrowser ?? true,
    canPause: overrides.canPause ?? availability !== 'PAUSED',
    canRemove: overrides.canRemove ?? availability !== 'BUSY',
    autoRetryExpected: overrides.autoRetryExpected ?? availability === 'LIMITED',
    activeJob: overrides.activeJob ?? null,
  };
}
