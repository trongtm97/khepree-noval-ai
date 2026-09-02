import type { OfficialContactChannel } from '@shared/constants/official-contacts';

export async function openOfficialContact(channel: OfficialContactChannel): Promise<boolean> {
  const result = await window.khepreeNovelAI.openOfficialContact(channel);
  return result.ok;
}
