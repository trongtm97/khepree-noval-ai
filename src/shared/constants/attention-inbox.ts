/**
 * Central Attention Inbox (Prompt 11) — user actions only, not tech logs.
 */

export const ATTENTION_INBOX_TYPES = [
  'LOGIN_REQUIRED',
  'CAPTCHA_REQUIRED',
  'QUOTA_EXHAUSTED',
  'PROVIDER_UNAVAILABLE',
  'SOURCE_CONFLICT',
  'SOURCE_MISSING',
  'STRUCTURE_UNKNOWN',
  'QA_CRITICAL',
  'LICENSE_REQUIRED',
  'EXPORT_FAILED',
  'PIPELINE_BLOCKED',
] as const;

export type AttentionInboxType = (typeof ATTENTION_INBOX_TYPES)[number];

export const ATTENTION_INBOX_STATUSES = [
  'OPEN',
  'SNOOZED',
  'RESOLVED',
  'DISMISSED',
] as const;

export type AttentionInboxStatus = (typeof ATTENTION_INBOX_STATUSES)[number];

export const ATTENTION_INBOX_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

export type AttentionInboxSeverity = (typeof ATTENTION_INBOX_SEVERITIES)[number];

export const ATTENTION_INBOX_PRIMARY_ACTIONS = [
  'OPEN_LOGIN',
  'RETRY',
  'CHOOSE_SOURCE',
  'VIEW_ERROR',
  'SWITCH_PROVIDER',
  'SKIP',
  'OPEN_FOLDER',
] as const;

export type AttentionInboxPrimaryAction =
  (typeof ATTENTION_INBOX_PRIMARY_ACTIONS)[number];

/** Types that require proactive user action — never bulk-retried. */
export const ATTENTION_INBOX_PROACTIVE_TYPES: ReadonlySet<AttentionInboxType> =
  new Set(['LOGIN_REQUIRED', 'CAPTCHA_REQUIRED', 'LICENSE_REQUIRED']);

/** Types safe for bulk retry. */
export const ATTENTION_INBOX_RETRYABLE_TYPES: ReadonlySet<AttentionInboxType> =
  new Set([
    'QUOTA_EXHAUSTED',
    'PROVIDER_UNAVAILABLE',
    'QA_CRITICAL',
    'EXPORT_FAILED',
    'PIPELINE_BLOCKED',
    'STRUCTURE_UNKNOWN',
  ]);

export interface AttentionInboxCopy {
  titleEn: string;
  titleVi: string;
  descriptionEn: string;
  descriptionVi: string;
}

export const ATTENTION_INBOX_COPY: Record<AttentionInboxType, AttentionInboxCopy> =
  {
    LOGIN_REQUIRED: {
      titleEn: 'Sign in required',
      titleVi: 'Cần đăng nhập',
      descriptionEn:
        'A browser account session expired or is logged out. Open login and sign in, then retry.',
      descriptionVi:
        'Phiên tài khoản trình duyệt hết hạn hoặc đã đăng xuất. Mở đăng nhập, rồi thử lại.',
    },
    CAPTCHA_REQUIRED: {
      titleEn: 'CAPTCHA / verification required',
      titleVi: 'Cần xác minh CAPTCHA',
      descriptionEn:
        'The provider asked for human verification. Open the browser, complete it, then continue. Never bypass.',
      descriptionVi:
        'Nhà cung cấp yêu cầu xác minh người dùng. Mở trình duyệt, hoàn tất, rồi tiếp tục. Không bỏ qua.',
    },
    QUOTA_EXHAUSTED: {
      titleEn: 'Account quota exhausted',
      titleVi: 'Hết hạn mức tài khoản',
      descriptionEn:
        'This account hit a usage limit. Wait, switch provider/account, or retry later.',
      descriptionVi:
        'Tài khoản đã hết hạn mức. Đợi, đổi nhà cung cấp/tài khoản, hoặc thử lại sau.',
    },
    PROVIDER_UNAVAILABLE: {
      titleEn: 'Provider unavailable',
      titleVi: 'Nhà cung cấp không sẵn sàng',
      descriptionEn:
        'The AI/browser provider is not ready. Check connection, switch provider, or retry.',
      descriptionVi:
        'Nhà cung cấp AI/trình duyệt chưa sẵn sàng. Kiểm tra kết nối, đổi provider, hoặc thử lại.',
    },
    SOURCE_CONFLICT: {
      titleEn: 'Source conflict',
      titleVi: 'Xung đột nguồn',
      descriptionEn:
        'Chapter source files conflict or changed unexpectedly. Choose the correct source before continuing.',
      descriptionVi:
        'File nguồn chương bị xung đột hoặc đổi bất thường. Chọn nguồn đúng trước khi tiếp tục.',
    },
    SOURCE_MISSING: {
      titleEn: 'Source file missing',
      titleVi: 'File nguồn không tìm thấy',
      descriptionEn:
        'A watched source file was removed. Translations were kept — restore the file or review the chapter.',
      descriptionVi:
        'File nguồn đang theo dõi đã bị xóa. Bản dịch được giữ — khôi phục file hoặc kiểm tra chương.',
    },
    STRUCTURE_UNKNOWN: {
      titleEn: 'Unknown document structure',
      titleVi: 'Cấu trúc tài liệu không rõ',
      descriptionEn:
        'The importer could not map chapters/paragraphs reliably. Review structure or adjust settings.',
      descriptionVi:
        'Bộ nhập không ánh xạ được chương/đoạn ổn định. Kiểm tra cấu trúc hoặc chỉnh thiết lập.',
    },
    QA_CRITICAL: {
      titleEn: 'Critical translation QA issue',
      titleVi: 'Lỗi QA bản dịch nghiêm trọng',
      descriptionEn:
        'A critical QA or whole-book audit finding needs your decision. Review and fix or dismiss.',
      descriptionVi:
        'Phát hiện QA/kiểm tra toàn truyện nghiêm trọng cần bạn quyết định. Xem và sửa hoặc bỏ qua.',
    },
    LICENSE_REQUIRED: {
      titleEn: 'License or feature required',
      titleVi: 'Cần giấy phép / tính năng',
      descriptionEn:
        'This action needs an active product capability. Check license or upgrade features.',
      descriptionVi:
        'Thao tác này cần quyền sản phẩm đang hiệu lực. Kiểm tra giấy phép hoặc tính năng.',
    },
    EXPORT_FAILED: {
      titleEn: 'Export failed',
      titleVi: 'Xuất bản thất bại',
      descriptionEn:
        'Export could not finish. Open the folder or view the error, then retry.',
      descriptionVi:
        'Không xuất được file. Mở thư mục hoặc xem lỗi, rồi thử lại.',
    },
    PIPELINE_BLOCKED: {
      titleEn: 'Translation pipeline blocked',
      titleVi: 'Pipeline dịch bị chặn',
      descriptionEn:
        'A campaign pipeline stage stopped and needs attention before other work can finish.',
      descriptionVi:
        'Một giai đoạn pipeline chiến dịch dừng và cần xử lý trước khi hoàn tất.',
    },
  };

export function defaultPrimaryAction(
  type: AttentionInboxType,
): AttentionInboxPrimaryAction {
  switch (type) {
    case 'LOGIN_REQUIRED':
      return 'OPEN_LOGIN';
    case 'CAPTCHA_REQUIRED':
      return 'OPEN_LOGIN';
    case 'QUOTA_EXHAUSTED':
      return 'SWITCH_PROVIDER';
    case 'PROVIDER_UNAVAILABLE':
      return 'SWITCH_PROVIDER';
    case 'SOURCE_CONFLICT':
      return 'CHOOSE_SOURCE';
    case 'SOURCE_MISSING':
      return 'OPEN_FOLDER';
    case 'STRUCTURE_UNKNOWN':
      return 'VIEW_ERROR';
    case 'QA_CRITICAL':
      return 'VIEW_ERROR';
    case 'LICENSE_REQUIRED':
      return 'VIEW_ERROR';
    case 'EXPORT_FAILED':
      return 'OPEN_FOLDER';
    case 'PIPELINE_BLOCKED':
      return 'RETRY';
    default:
      return 'VIEW_ERROR';
  }
}

export function defaultSeverity(
  type: AttentionInboxType,
): AttentionInboxSeverity {
  switch (type) {
    case 'CAPTCHA_REQUIRED':
    case 'LOGIN_REQUIRED':
    case 'LICENSE_REQUIRED':
    case 'QA_CRITICAL':
      return 'critical';
    case 'SOURCE_CONFLICT':
    case 'SOURCE_MISSING':
    case 'PIPELINE_BLOCKED':
    case 'PROVIDER_UNAVAILABLE':
      return 'high';
    case 'QUOTA_EXHAUSTED':
    case 'EXPORT_FAILED':
      return 'medium';
    default:
      return 'low';
  }
}

/** Map browser pool / automation codes → inbox type. */
export function mapBrowserKindToInboxType(kind: string): AttentionInboxType {
  const k = kind.toUpperCase();
  if (k.includes('LOGIN')) return 'LOGIN_REQUIRED';
  if (k.includes('CAPTCHA')) return 'CAPTCHA_REQUIRED';
  if (k.includes('QUOTA')) return 'QUOTA_EXHAUSTED';
  if (k.includes('BLOCK')) return 'PROVIDER_UNAVAILABLE';
  return 'PROVIDER_UNAVAILABLE';
}

export function buildAttentionDedupeKey(parts: {
  type: AttentionInboxType;
  accountId?: string | null;
  projectId?: string | null;
  campaignId?: string | null;
  chapterId?: string | null;
  jobId?: string | null;
  causeCode?: string | null;
}): string {
  return [
    parts.type,
    parts.accountId ?? '',
    parts.projectId ?? '',
    parts.campaignId ?? '',
    parts.chapterId ?? '',
    parts.causeCode ?? '',
    // jobId intentionally omitted from key when account/project scoped —
    // many jobs → one inbox row; affected jobs listed in scope_json
  ].join('|');
}
