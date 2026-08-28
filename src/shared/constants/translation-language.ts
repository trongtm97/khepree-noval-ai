/** Typed error when production cannot resolve source/target for a translation edition. */
export const TRANSLATION_LANGUAGE_PAIR_MISSING = 'TRANSLATION_LANGUAGE_PAIR_MISSING';

export const TRANSLATION_LANGUAGE_PAIR_MISSING_MESSAGE =
  'Không xác định được cặp ngôn ngữ của bản dịch.';

export class TranslationLanguagePairMissingError extends Error {
  readonly code = TRANSLATION_LANGUAGE_PAIR_MISSING;

  constructor(message = TRANSLATION_LANGUAGE_PAIR_MISSING_MESSAGE) {
    super(message);
    this.name = 'TranslationLanguagePairMissingError';
  }
}
