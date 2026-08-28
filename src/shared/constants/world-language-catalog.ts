import type {
  AiSupportTier,
  LanguageCatalogSeed,
  NovelTransVerification,
  ProviderSupport,
  RegionGroup,
} from './language-catalog-types';
import {
  GEMINI_WEB_OFFICIAL_CODES,
  NOVELTRANS_VERIFIED_CODES,
} from './gemini-web-official-2026';

export { REGION_GROUPS } from './language-catalog-types';
export {
  GEMINI_WEB_OFFICIAL_AUDIT_DATE,
  GEMINI_WEB_OFFICIAL_CODES,
  GEMINI_WEB_OFFICIAL_SOURCE_URL,
  NOVELTRANS_VERIFIED_CODES,
} from './gemini-web-official-2026';

/** @deprecated Use GEMINI_WEB_OFFICIAL_CODES — kept for tests during transition. */
export const GEMINI_WEB_VERIFIED_CODES = GEMINI_WEB_OFFICIAL_CODES;

/** Broader Gemini/API capability — not listed on Gemini Web UI. */
export const GEMINI_EXTENDED_CODES = new Set<string>([
  'ceb', 'ny', 'co', 'eo', 'fy', 'ht', 'ha', 'haw', 'hmn', 'ig', 'ga', 'rw', 'ku', 'ky',
  'lb', 'mg', 'mi', 'mt', 'sm', 'gd', 'st', 'sn', 'sd', 'si', 'so', 'tg', 'cy', 'xh',
  'yi', 'yo', 'my', 'mai', 'ckb', 'ps', 'bo', 'ug', 'tk', 'az-Cyrl', 'ti', 'om', 'qu',
  'gn', 'ay', 'to', 'fj', 'la', 'sa',
]);

function deriveAiSupportTier(provider: ProviderSupport): AiSupportTier {
  if (provider === 'GEMINI_WEB_OFFICIAL') return 'GEMINI_WEB_VERIFIED';
  if (provider === 'GEMINI_API_EXTENDED') return 'GEMINI_EXTENDED';
  return 'EXPERIMENTAL';
}

function providerSupportFor(code: string): ProviderSupport {
  if (GEMINI_WEB_OFFICIAL_CODES.has(code)) return 'GEMINI_WEB_OFFICIAL';
  if (GEMINI_EXTENDED_CODES.has(code)) return 'GEMINI_API_EXTENDED';
  return 'CATALOG_ONLY';
}

function verificationFor(code: string): NovelTransVerification {
  if (NOVELTRANS_VERIFIED_CODES.has(code)) return 'VERIFIED';
  return 'UNTESTED';
}

function tierFor(code: string, override?: AiSupportTier): AiSupportTier {
  if (override) return override;
  return deriveAiSupportTier(providerSupportFor(code));
}

type Seed = [
  code: string,
  internationalName: string,
  nativeName: string,
  displayNameVi: string,
  script: string,
  direction: 'ltr' | 'rtl',
  region: RegionGroup,
  tier?: AiSupportTier,
];

function seeds(rows: Seed[]): LanguageCatalogSeed[] {
  return rows.map(([code, internationalName, nativeName, displayNameVi, script, direction, region, tier]) => {
    const providerSupport = providerSupportFor(code);
    return {
      code,
      internationalName,
      nativeName,
      displayNameVi,
      script,
      direction,
      regionGroup: region,
      providerSupport,
      novelTransVerification: verificationFor(code),
      aiSupportTier: tierFor(code, tier),
    };
  });
}

/** ISO 639-1 practical catalog + important BCP-47 script/region variants. */
export const WORLD_LANGUAGE_CATALOG: LanguageCatalogSeed[] = seeds([
  // POPULAR
  ['zh-Hans', 'Chinese (Simplified)', '简体中文', 'Tiếng Trung giản thể', 'Hans', 'ltr', 'POPULAR'],
  ['zh-Hant', 'Chinese (Traditional)', '繁體中文', 'Tiếng Trung phồn thể', 'Hant', 'ltr', 'POPULAR'],
  ['zh-HK', 'Chinese (Hong Kong)', '香港中文', 'Tiếng Trung (Hồng Kông)', 'Hant', 'ltr', 'POPULAR'],
  ['vi', 'Vietnamese', 'Tiếng Việt', 'Tiếng Việt', 'Latn', 'ltr', 'POPULAR'],
  ['en', 'English', 'English', 'Tiếng Anh', 'Latn', 'ltr', 'POPULAR'],
  ['ja', 'Japanese', '日本語', 'Tiếng Nhật', 'Jpan', 'ltr', 'POPULAR'],
  ['ko', 'Korean', '한국어', 'Tiếng Hàn', 'Kore', 'ltr', 'POPULAR'],
  ['fr', 'French', 'Français', 'Tiếng Pháp', 'Latn', 'ltr', 'POPULAR'],
  ['de', 'German', 'Deutsch', 'Tiếng Đức', 'Latn', 'ltr', 'POPULAR'],
  ['es', 'Spanish', 'Español', 'Tiếng Tây Ban Nha', 'Latn', 'ltr', 'POPULAR'],
  ['pt', 'Portuguese', 'Português', 'Tiếng Bồ Đào Nha', 'Latn', 'ltr', 'POPULAR'],
  ['pt-BR', 'Portuguese (Brazil)', 'Português (Brasil)', 'Tiếng Bồ Đào Nha (Brazil)', 'Latn', 'ltr', 'POPULAR'],
  ['pt-PT', 'Portuguese (Portugal)', 'Português (Portugal)', 'Tiếng Bồ Đào Nha (Bồ Đào Nha)', 'Latn', 'ltr', 'POPULAR'],
  ['ru', 'Russian', 'Русский', 'Tiếng Nga', 'Cyrl', 'ltr', 'POPULAR'],
  ['ar', 'Arabic', 'العربية', 'Tiếng Ả Rập', 'Arab', 'rtl', 'POPULAR'],
  ['th', 'Thai', 'ไทย', 'Tiếng Thái', 'Thai', 'ltr', 'POPULAR'],
  ['id', 'Indonesian', 'Bahasa Indonesia', 'Tiếng Indonesia', 'Latn', 'ltr', 'POPULAR'],

  // EAST_ASIA
  ['mn', 'Mongolian', 'Монгол', 'Tiếng Mông Cổ', 'Cyrl', 'ltr', 'EAST_ASIA'],
  ['bo', 'Tibetan', 'བོད་སྐད་', 'Tiếng Tạng', 'Tibt', 'ltr', 'EAST_ASIA'],
  ['ug', 'Uyghur', 'ئۇيغۇرچە', 'Tiếng Uyghur', 'Arab', 'rtl', 'EAST_ASIA'],

  // SOUTHEAST_ASIA
  ['ms', 'Malay', 'Bahasa Melayu', 'Tiếng Mã Lai', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['my', 'Burmese', 'မြန်မာဘာသာ', 'Tiếng Miến Điện', 'Mymr', 'ltr', 'SOUTHEAST_ASIA'],
  ['km', 'Khmer', 'ភាសាខ្មែរ', 'Tiếng Khmer', 'Khmr', 'ltr', 'SOUTHEAST_ASIA'],
  ['lo', 'Lao', 'ລາວ', 'Tiếng Lào', 'Laoo', 'ltr', 'SOUTHEAST_ASIA'],
  ['fil', 'Filipino', 'Filipino', 'Tiếng Filipino', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['tl', 'Tagalog', 'Tagalog', 'Tiếng Tagalog', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['ceb', 'Cebuano', 'Cebuano', 'Tiếng Cebuano', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['jv', 'Javanese', 'Basa Jawa', 'Tiếng Java', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['su', 'Sundanese', 'Basa Sunda', 'Tiếng Sunda', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],
  ['hmn', 'Hmong', 'Hmoob', 'Tiếng Hmong', 'Latn', 'ltr', 'SOUTHEAST_ASIA'],

  // SOUTH_ASIA
  ['hi', 'Hindi', 'हिन्दी', 'Tiếng Hindi', 'Deva', 'ltr', 'SOUTH_ASIA'],
  ['bn', 'Bengali', 'বাংলা', 'Tiếng Bengal', 'Beng', 'ltr', 'SOUTH_ASIA'],
  ['pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'Tiếng Punjab', 'Guru', 'ltr', 'SOUTH_ASIA'],
  ['gu', 'Gujarati', 'ગુજરાતી', 'Tiếng Gujarat', 'Gujr', 'ltr', 'SOUTH_ASIA'],
  ['or', 'Odia', 'ଓଡ଼ିଆ', 'Tiếng Odia', 'Orya', 'ltr', 'SOUTH_ASIA'],
  ['ta', 'Tamil', 'தமிழ்', 'Tiếng Tamil', 'Taml', 'ltr', 'SOUTH_ASIA'],
  ['te', 'Telugu', 'తెలుగు', 'Tiếng Telugu', 'Telu', 'ltr', 'SOUTH_ASIA'],
  ['kn', 'Kannada', 'ಕನ್ನಡ', 'Tiếng Kannada', 'Knda', 'ltr', 'SOUTH_ASIA'],
  ['ml', 'Malayalam', 'മലയാളം', 'Tiếng Malayalam', 'Mlym', 'ltr', 'SOUTH_ASIA'],
  ['mr', 'Marathi', 'मराठी', 'Tiếng Marathi', 'Deva', 'ltr', 'SOUTH_ASIA'],
  ['ne', 'Nepali', 'नेपाली', 'Tiếng Nepal', 'Deva', 'ltr', 'SOUTH_ASIA'],
  ['si', 'Sinhala', 'සිංහල', 'Tiếng Sinhala', 'Sinh', 'ltr', 'SOUTH_ASIA'],
  ['ur', 'Urdu', 'اردو', 'Tiếng Urdu', 'Arab', 'rtl', 'SOUTH_ASIA'],
  ['sd', 'Sindhi', 'سنڌي', 'Tiếng Sindhi', 'Arab', 'rtl', 'SOUTH_ASIA'],
  ['as', 'Assamese', 'অসমীয়া', 'Tiếng Assam', 'Beng', 'ltr', 'SOUTH_ASIA'],
  ['mai', 'Maithili', 'मैथिली', 'Tiếng Maithili', 'Deva', 'ltr', 'SOUTH_ASIA'],

  // CENTRAL_ASIA
  ['kk', 'Kazakh', 'Қазақ тілі', 'Tiếng Kazakhstan', 'Cyrl', 'ltr', 'CENTRAL_ASIA'],
  ['uz', 'Uzbek', 'Oʻzbek', 'Tiếng Uzbek', 'Latn', 'ltr', 'CENTRAL_ASIA'],
  ['uz-Latn', 'Uzbek (Latin)', 'Oʻzbekcha', 'Tiếng Uzbek (Latin)', 'Latn', 'ltr', 'CENTRAL_ASIA'],
  ['ky', 'Kyrgyz', 'Кыргызча', 'Tiếng Kyrgyz', 'Cyrl', 'ltr', 'CENTRAL_ASIA'],
  ['tg', 'Tajik', 'Тоҷикӣ', 'Tiếng Tajik', 'Cyrl', 'ltr', 'CENTRAL_ASIA'],
  ['tk', 'Turkmen', 'Türkmençe', 'Tiếng Turkmen', 'Latn', 'ltr', 'CENTRAL_ASIA'],
  ['az', 'Azerbaijani', 'Azərbaycan', 'Tiếng Azerbaijan', 'Latn', 'ltr', 'CENTRAL_ASIA'],
  ['az-Latn', 'Azerbaijani (Latin)', 'Azərbaycanca', 'Tiếng Azerbaijan (Latin)', 'Latn', 'ltr', 'CENTRAL_ASIA'],
  ['az-Cyrl', 'Azerbaijani (Cyrillic)', 'Азәрбајҹан', 'Tiếng Azerbaijan (Cyrillic)', 'Cyrl', 'ltr', 'CENTRAL_ASIA'],

  // MIDDLE_EAST
  ['he', 'Hebrew', 'עברית', 'Tiếng Do Thái', 'Hebr', 'rtl', 'MIDDLE_EAST'],
  ['fa', 'Persian', 'فارسی', 'Tiếng Ba Tư', 'Arab', 'rtl', 'MIDDLE_EAST'],
  ['tr', 'Turkish', 'Türkçe', 'Tiếng Thổ Nhĩ Kỳ', 'Latn', 'ltr', 'MIDDLE_EAST'],
  ['ku', 'Kurdish', 'Kurdî', 'Tiếng Kurd', 'Latn', 'ltr', 'MIDDLE_EAST'],
  ['ps', 'Pashto', 'پښتو', 'Tiếng Pashto', 'Arab', 'rtl', 'MIDDLE_EAST'],
  ['ckb', 'Kurdish (Sorani)', 'کوردی', 'Tiếng Kurd Sorani', 'Arab', 'rtl', 'MIDDLE_EAST'],
  ['hy', 'Armenian', 'Հայերեն', 'Tiếng Armenia', 'Armn', 'ltr', 'MIDDLE_EAST'],
  ['ka', 'Georgian', 'ქართული', 'Tiếng Georgia', 'Geor', 'ltr', 'MIDDLE_EAST'],

  // EUROPE
  ['it', 'Italian', 'Italiano', 'Tiếng Ý', 'Latn', 'ltr', 'EUROPE'],
  ['nl', 'Dutch', 'Nederlands', 'Tiếng Hà Lan', 'Latn', 'ltr', 'EUROPE'],
  ['pl', 'Polish', 'Polski', 'Tiếng Ba Lan', 'Latn', 'ltr', 'EUROPE'],
  ['uk', 'Ukrainian', 'Українська', 'Tiếng Ukraina', 'Cyrl', 'ltr', 'EUROPE'],
  ['cs', 'Czech', 'Čeština', 'Tiếng Séc', 'Latn', 'ltr', 'EUROPE'],
  ['sk', 'Slovak', 'Slovenčina', 'Tiếng Slovakia', 'Latn', 'ltr', 'EUROPE'],
  ['hu', 'Hungarian', 'Magyar', 'Tiếng Hungary', 'Latn', 'ltr', 'EUROPE'],
  ['ro', 'Romanian', 'Română', 'Tiếng Romania', 'Latn', 'ltr', 'EUROPE'],
  ['bg', 'Bulgarian', 'Български', 'Tiếng Bulgaria', 'Cyrl', 'ltr', 'EUROPE'],
  ['el', 'Greek', 'Ελληνικά', 'Tiếng Hy Lạp', 'Grek', 'ltr', 'EUROPE'],
  ['sv', 'Swedish', 'Svenska', 'Tiếng Thụy Điển', 'Latn', 'ltr', 'EUROPE'],
  ['no', 'Norwegian', 'Norsk', 'Tiếng Na Uy', 'Latn', 'ltr', 'EUROPE'],
  ['da', 'Danish', 'Dansk', 'Tiếng Đan Mạch', 'Latn', 'ltr', 'EUROPE'],
  ['fi', 'Finnish', 'Suomi', 'Tiếng Phần Lan', 'Latn', 'ltr', 'EUROPE'],
  ['is', 'Icelandic', 'Íslenska', 'Tiếng Iceland', 'Latn', 'ltr', 'EUROPE'],
  ['et', 'Estonian', 'Eesti', 'Tiếng Estonia', 'Latn', 'ltr', 'EUROPE'],
  ['lv', 'Latvian', 'Latviešu', 'Tiếng Latvia', 'Latn', 'ltr', 'EUROPE'],
  ['lt', 'Lithuanian', 'Lietuvių', 'Tiếng Litva', 'Latn', 'ltr', 'EUROPE'],
  ['hr', 'Croatian', 'Hrvatski', 'Tiếng Croatia', 'Latn', 'ltr', 'EUROPE'],
  ['sr', 'Serbian', 'Српски', 'Tiếng Serbia', 'Cyrl', 'ltr', 'EUROPE'],
  ['sr-Latn', 'Serbian (Latin)', 'Srpski', 'Tiếng Serbia (Latin)', 'Latn', 'ltr', 'EUROPE'],
  ['sr-Cyrl', 'Serbian (Cyrillic)', 'Српски', 'Tiếng Serbia (Cyrillic)', 'Cyrl', 'ltr', 'EUROPE'],
  ['sl', 'Slovenian', 'Slovenščina', 'Tiếng Slovenia', 'Latn', 'ltr', 'EUROPE'],
  ['bs', 'Bosnian', 'Bosanski', 'Tiếng Bosnia', 'Latn', 'ltr', 'EUROPE'],
  ['mk', 'Macedonian', 'Македонски', 'Tiếng Macedonia', 'Cyrl', 'ltr', 'EUROPE'],
  ['sq', 'Albanian', 'Shqip', 'Tiếng Albania', 'Latn', 'ltr', 'EUROPE'],
  ['be', 'Belarusian', 'Беларуская', 'Tiếng Belarus', 'Cyrl', 'ltr', 'EUROPE'],
  ['ca', 'Catalan', 'Català', 'Tiếng Catalan', 'Latn', 'ltr', 'EUROPE'],
  ['gl', 'Galician', 'Galego', 'Tiếng Galicia', 'Latn', 'ltr', 'EUROPE'],
  ['eu', 'Basque', 'Euskara', 'Tiếng Basque', 'Latn', 'ltr', 'EUROPE'],
  ['cy', 'Welsh', 'Cymraeg', 'Tiếng Wales', 'Latn', 'ltr', 'EUROPE'],
  ['ga', 'Irish', 'Gaeilge', 'Tiếng Ireland', 'Latn', 'ltr', 'EUROPE'],
  ['gd', 'Scottish Gaelic', 'Gàidhlig', 'Tiếng Gael Scotland', 'Latn', 'ltr', 'EUROPE'],
  ['mt', 'Maltese', 'Malti', 'Tiếng Malta', 'Latn', 'ltr', 'EUROPE'],
  ['lb', 'Luxembourgish', 'Lëtzebuergesch', 'Tiếng Luxembourg', 'Latn', 'ltr', 'EUROPE'],
  ['fy', 'Frisian', 'Frysk', 'Tiếng Frisia', 'Latn', 'ltr', 'EUROPE'],
  ['eo', 'Esperanto', 'Esperanto', 'Tiếng Esperanto', 'Latn', 'ltr', 'EUROPE'],
  ['yi', 'Yiddish', 'ייִדיש', 'Tiếng Yiddish', 'Hebr', 'rtl', 'EUROPE'],

  // AFRICA
  ['sw', 'Swahili', 'Kiswahili', 'Tiếng Swahili', 'Latn', 'ltr', 'AFRICA'],
  ['am', 'Amharic', 'አማርኛ', 'Tiếng Amharic', 'Ethi', 'ltr', 'AFRICA'],
  ['ha', 'Hausa', 'Hausa', 'Tiếng Hausa', 'Latn', 'ltr', 'AFRICA'],
  ['ig', 'Igbo', 'Igbo', 'Tiếng Igbo', 'Latn', 'ltr', 'AFRICA'],
  ['yo', 'Yoruba', 'Yorùbá', 'Tiếng Yoruba', 'Latn', 'ltr', 'AFRICA'],
  ['zu', 'Zulu', 'isiZulu', 'Tiếng Zulu', 'Latn', 'ltr', 'AFRICA'],
  ['xh', 'Xhosa', 'isiXhosa', 'Tiếng Xhosa', 'Latn', 'ltr', 'AFRICA'],
  ['st', 'Southern Sotho', 'Sesotho', 'Tiếng Sotho', 'Latn', 'ltr', 'AFRICA'],
  ['sn', 'Shona', 'chiShona', 'Tiếng Shona', 'Latn', 'ltr', 'AFRICA'],
  ['rw', 'Kinyarwanda', 'Ikinyarwanda', 'Tiếng Kinyarwanda', 'Latn', 'ltr', 'AFRICA'],
  ['ny', 'Chichewa', 'Chichewa', 'Tiếng Chichewa', 'Latn', 'ltr', 'AFRICA'],
  ['mg', 'Malagasy', 'Malagasy', 'Tiếng Malagasy', 'Latn', 'ltr', 'AFRICA'],
  ['so', 'Somali', 'Soomaali', 'Tiếng Somali', 'Latn', 'ltr', 'AFRICA'],
  ['ti', 'Tigrinya', 'ትግርኛ', 'Tiếng Tigrinya', 'Ethi', 'ltr', 'AFRICA'],
  ['om', 'Oromo', 'Oromoo', 'Tiếng Oromo', 'Latn', 'ltr', 'AFRICA'],

  // AMERICAS
  ['ht', 'Haitian Creole', 'Kreyòl ayisyen', 'Tiếng Haiti', 'Latn', 'ltr', 'AMERICAS'],
  ['qu', 'Quechua', 'Runa Simi', 'Tiếng Quechua', 'Latn', 'ltr', 'AMERICAS'],
  ['gn', 'Guarani', "Avañe'ẽ", 'Tiếng Guarani', 'Latn', 'ltr', 'AMERICAS'],
  ['ay', 'Aymara', 'Aymar aru', 'Tiếng Aymara', 'Latn', 'ltr', 'AMERICAS'],
  ['haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi', 'Tiếng Hawaii', 'Latn', 'ltr', 'AMERICAS'],

  // OCEANIA
  ['mi', 'Maori', 'Te Reo Māori', 'Tiếng Maori', 'Latn', 'ltr', 'OCEANIA'],
  ['sm', 'Samoan', 'Gagana Samoa', 'Tiếng Samoa', 'Latn', 'ltr', 'OCEANIA'],
  ['to', 'Tongan', 'lea fakatonga', 'Tiếng Tonga', 'Latn', 'ltr', 'OCEANIA'],
  ['fj', 'Fijian', 'Na Vosa Vakaviti', 'Tiếng Fiji', 'Latn', 'ltr', 'OCEANIA'],

  // OTHER
  ['af', 'Afrikaans', 'Afrikaans', 'Tiếng Afrikaans', 'Latn', 'ltr', 'OTHER'],
  ['co', 'Corsican', 'Corsu', 'Tiếng Corsica', 'Latn', 'ltr', 'OTHER'],
  ['la', 'Latin', 'Latina', 'Tiếng Latin', 'Latn', 'ltr', 'OTHER'],
  ['sa', 'Sanskrit', 'संस्कृतम्', 'Tiếng Phạn', 'Deva', 'ltr', 'OTHER'],
]);
