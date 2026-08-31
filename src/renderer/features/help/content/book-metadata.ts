import type { HelpArticle } from '../types';

const BOOK_INFO_SAMPLE = `Tên truyện:
仙逆

Tên tiếng Việt:
Tiên Nghịch

Tên khác:
Renegade Immortal

Tác giả:
耳根

Thể loại:
Tiên hiệp, Tu chân, Huyền huyễn

Trạng thái:
Hoàn thành

Tổng số chương:
2088

Mô tả:
Vương Lâm là một thiếu niên bình thường...

Giới thiệu:
...

Tóm tắt:
Vương Lâm sinh ra tại một làng nhỏ...

Ghi chú:
...`;

export const bookMetadataArticles: HelpArticle[] = [
  {
    id: 'book-metadata-prep',
    categoryId: 'projects',
    title: 'Chuẩn bị thông tin truyện',
    description:
      'Metadata, tài liệu phụ và chương mở đầu — tách khỏi chương thường khi nhập thư mục.',
    keywords: [
      'metadata',
      'thông tin truyện',
      'book info',
      '_BOOK_INFO',
      'tài liệu',
      'mô tả',
      'tác giả',
      'thể loại',
    ],
    order: 0,
    relatedIds: ['book-info-file', 'prologue-preface', 'project-info', 'book-profile', 'import-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Chuẩn bị thông tin truyện' },
      {
        type: 'paragraph',
        text: 'Ngoài các file chương TXT, bạn có thể chuẩn bị thêm metadata và tài liệu phụ trong cùng thư mục nguồn. Khepree Novel AI tự phân loại — không gộp tên truyện, mô tả hay tóm tắt vào bảng chương.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Tuỳ chọn',
        body: 'Không bắt buộc có file metadata. Chỉ cần file chương vẫn tạo dự án bình thường. Bạn cũng có thể nhập hoặc sửa thông tin trực tiếp trong phần mềm (Thông tin truyện).',
      },
      { type: 'heading', level: 2, text: 'Cấu trúc thư mục khuyến nghị' },
      {
        type: 'code',
        text: `TienNghich/
├── _BOOK_INFO.txt      ← metadata chính (tuỳ chọn)
├── _SUMMARY.txt        ← tóm tắt chính thức (tuỳ chọn)
├── _AUTHOR_NOTE.txt    ← lời tác giả (tuỳ chọn)
├── 000000_Prologue.txt ← chương mở đầu (tuỳ chọn)
├── 000001.txt
├── 000002.txt
└── ...`,
      },
      { type: 'heading', level: 2, text: 'Khepree Novel AI phân loại như thế nào' },
      {
        type: 'table',
        headers: ['Loại', 'Ví dụ file', 'Lưu vào đâu'],
        rows: [
          ['Thông tin truyện', '_BOOK_INFO.txt', 'Bảng metadata dự án'],
          ['Tài liệu phụ', '_SUMMARY.txt, 作者简介.txt', 'project_documents'],
          ['Chương mở đầu', '序章.txt, 楔子.txt, Prologue', 'Chapters (PROLOGUE)'],
          ['Chương thường', '000001.txt, 第1章.txt', 'Chapters (NORMAL)'],
          ['Ngoại truyện', '番外1.txt', 'Chapters (EXTRA)'],
          ['Chương kết', '终章.txt, 后记.txt', 'Chapters (EPILOGUE)'],
          ['Chưa rõ', 'readme.txt', 'UNKNOWN — không tự nhập chương'],
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Quan trọng',
        body: 'Tóm tắt chính thức (official summary) khác trạng thái truyện đang dịch (story state). Khepree Novel AI không trộn hai loại dữ liệu này.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Định dạng _BOOK_INFO.txt', to: '/help/book-info-file' },
          { label: 'Chương mở đầu vs lời nói đầu', to: '/help/prologue-preface' },
        ],
      },
    ],
  },
  {
    id: 'book-info-file',
    categoryId: 'projects',
    title: 'File _BOOK_INFO.txt',
    description: 'Định dạng file metadata tuỳ chọn — key tiếng Việt, Trung hoặc Anh.',
    keywords: [
      '_BOOK_INFO',
      'book info',
      'tên truyện',
      'tác giả',
      'thể loại',
      'tóm tắt',
      'parser',
    ],
    order: 0.5,
    relatedIds: ['book-metadata-prep', 'project-info'],
    blocks: [
      { type: 'heading', level: 1, text: 'File _BOOK_INFO.txt' },
      {
        type: 'paragraph',
        text: 'Đặt file _BOOK_INFO.txt trong thư mục nguồn. Khi quét thư mục, Khepree Novel AI đọc các cặp key: value và điền vào metadata dự án. Hỗ trợ nhãn tiếng Việt, tiếng Trung và tiếng Anh.',
      },
      { type: 'heading', level: 2, text: 'Ví dụ mẫu' },
      { type: 'code', text: BOOK_INFO_SAMPLE },
      { type: 'heading', level: 2, text: 'Các key thường gặp' },
      {
        type: 'table',
        headers: ['Trường', 'Key VI / ZH / EN'],
        rows: [
          ['Tên gốc', 'Tên truyện · Title · 作品名 · 书名'],
          ['Tên Việt', 'Tên tiếng Việt · Vietnamese title'],
          ['Tác giả', 'Tác giả · Author · 作者'],
          ['Thể loại', 'Thể loại · Genre · 类型 · 分类'],
          ['Trạng thái', 'Trạng thái · Status · 状态'],
          ['Tổng chương', 'Tổng số chương · Total chapters · 章节数'],
          ['Mô tả', 'Mô tả · Description · 简介 · 作品简介'],
          ['Tóm tắt', 'Tóm tắt · Summary · 内容简介'],
          ['Ghi chú', 'Ghi chú · Notes · 备注'],
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'Key không cần đúng tuyệt đối một format. Phần parser không nhận ra sẽ gom vào Ghi chú. File bắt đầu bằng dấu _ ưu tiên được coi là metadata/tài liệu, không phải chương.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Sau khi nhập',
        body: 'Metadata từ _BOOK_INFO hiển thị trong bước xem trước khi tạo dự án và trong tab Thông tin truyện. Book Profile compact được đồng bộ lên Notebook (00_BOOK_PROFILE.md) — không gửi nguyên mô tả dài mỗi lần dịch.',
      },
      {
        type: 'faq',
        items: [
          {
            q: 'Không có _BOOK_INFO.txt thì sao?',
            a: 'Wizard vẫn hoạt động. Nhập tên dự án (bắt buộc) và các field khác tuỳ chọn trong form, hoặc bổ sung sau ở Thông tin truyện.',
          },
          {
            q: 'Sửa _BOOK_INFO sau khi đã nhập?',
            a: 'Quét lại thư mục. Nếu bạn đã chỉnh metadata trong app, Khepree Novel AI ưu tiên dữ liệu đã xác nhận — có thể báo xung đột thay vì ghi đè.',
          },
        ],
      },
    ],
  },
  {
    id: 'prologue-preface',
    categoryId: 'projects',
    title: 'Chương mở đầu và lời nói đầu',
    description: 'Phân biệt PROLOGUE (nội dung truyện) và PREFACE (tài liệu phụ).',
    keywords: [
      'prologue',
      '序章',
      '楔子',
      '引子',
      '前言',
      'preface',
      'lời nói đầu',
      'chương mở đầu',
    ],
    order: 0.6,
    relatedIds: ['book-metadata-prep', 'import-novel', 'chapter-split'],
    blocks: [
      { type: 'heading', level: 1, text: 'Chương mở đầu và lời nói đầu' },
      {
        type: 'paragraph',
        text: 'Tiểu thuyết Trung Quốc thường có nhiều phần đứng trước Chương 1. Khepree Novel AI không coi tất cả là một chương thường hay metadata.',
      },
      { type: 'heading', level: 2, text: 'Tài liệu phụ (không dịch như chương)' },
      {
        type: 'list',
        items: [
          '作品简介 / Mô tả — BOOK_DESCRIPTION',
          '内容简介 — OFFICIAL_SUMMARY',
          '作者简介 / 作者的话 — AUTHOR_NOTE',
          '前言 / 序 / 序言 — PREFACE (lời nói đầu)',
          '_SUMMARY.txt, _AUTHOR_NOTE.txt — file gợi ý tên',
        ],
      },
      { type: 'heading', level: 2, text: 'Chương mở đầu (dịch như nội dung truyện)' },
      {
        type: 'list',
        items: [
          '序章 · 楔子 · 引子 — thường là nội dung kể chuyện',
          '000000_Prologue.txt · 第零章',
          'Hiển thị: "Chương mở đầu", sequence_order = 0, đứng trước Chương 1',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Lưu ý',
        body: 'Lời giới thiệu / tóm tắt marketing không được coi là chương. Nếu Khepree Novel AI phân loại sai, đổi tên file theo quy ước (_SUMMARY.txt, 序章.txt…) rồi quét lại thư mục.',
      },
      { type: 'heading', level: 2, text: 'Chương đặc biệt khác' },
      {
        type: 'table',
        headers: ['Loại', 'Ví dụ', 'Hiển thị'],
        rows: [
          ['Ngoại truyện', '番外1.txt', 'Ngoại truyện 1'],
          ['Chương kết', '终章.txt, 后记.txt', 'Chương kết'],
          ['Chương thường', '000001.txt', 'Chương 1'],
        ],
      },
    ],
  },
  {
    id: 'project-info',
    categoryId: 'projects',
    title: 'Tab Thông tin truyện',
    description: 'Xem và sửa metadata, đồng bộ Book Profile lên Notebook.',
    keywords: [
      'thông tin truyện',
      'metadata',
      'sửa tên',
      'tác giả',
      'mô tả',
      'book profile',
      'notebook',
    ],
    order: 0.7,
    relatedIds: ['book-info-file', 'book-metadata-prep', 'book-profile', 'connect-drive'],
    blocks: [
      { type: 'heading', level: 1, text: 'Thông tin truyện trong Khepree Novel AI' },
      {
        type: 'paragraph',
        text: 'Từ trang Dự án, mở Thông tin truyện để xem và chỉnh metadata: tên gốc, tên Việt, tác giả, thể loại, mô tả, tóm tắt chính thức, ghi chú và danh sách tài liệu phụ đã nhập.',
      },
      {
        type: 'steps',
        steps: [
          {
            title: 'Mở tab',
            body: 'Dự án → chọn dự án → Thông tin truyện (hoặc /projects/…/info).',
          },
          {
            title: 'Chỉnh sửa',
            body: 'Nhấn Chỉnh sửa, cập nhật các trường. Chỉ Tên dự án là bắt buộc khi tạo mới; các field khác tuỳ chọn.',
          },
          {
            title: 'Đồng bộ Notebook',
            body: 'Nhấn Đồng bộ Notebook để cập nhật 00_BOOK_PROFILE.md trên Drive. Trạng thái truyện khi dịch vẫn nằm ở 05_STORY_STATE.md — không trộn.',
          },
        ],
      },
      { type: 'heading', level: 2, text: 'Các trường trên form' },
      {
        type: 'table',
        headers: ['Trường', 'Nguồn thường gặp', 'Ghi chú'],
        rows: [
          ['Tên dự án', 'Wizard / người dùng', 'Bắt buộc — tên hiển thị trong app'],
          ['Tên gốc / Tên Việt', '_BOOK_INFO.txt', 'Tên tiếng Trung và bản dịch tên'],
          ['Tác giả, thể loại', '_BOOK_INFO.txt', 'Preset thể loại gợi ý thuật ngữ'],
          ['Mô tả / Giới thiệu', '_BOOK_INFO.txt hoặc file phụ', 'Không lưu như chương'],
          ['Tóm tắt chính thức', '_BOOK_INFO / _SUMMARY.txt', 'Khác trạng thái truyện khi dịch'],
          ['Ghi chú', 'Parser hoặc người dùng', 'Field không map được từ _BOOK_INFO'],
        ],
      },
      { type: 'heading', level: 2, text: 'Tài liệu phụ đã nhập' },
      {
        type: 'paragraph',
        text: 'Cuối trang hiển thị bảng tài liệu phụ (loại + tên file nguồn): _SUMMARY.txt, 作者简介.txt, 前言.txt… Nội dung đọc khi quét thư mục; chỉnh metadata chính trên form phía trên.',
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Ưu tiên khi quét lại',
        body: 'Dữ liệu bạn đã sửa và lưu trong app được ưu tiên hơn _BOOK_INFO.txt mới. Sau khi sửa file nguồn, mở Thông tin truyện để so sánh — Khepree Novel AI không ghi đè im lặng các trường đã xác nhận.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thể loại',
        body: 'Có preset: Tiên hiệp, Tu chân, Huyền huyễn, Võ hiệp, Ngôn tình, … Dùng để gợi ý thuật ngữ — không khóa cứng cách dịch.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Book Profile & Notebook', to: '/help/book-profile' },
          { label: 'Mở Dự án', to: '/projects' },
        ],
      },
    ],
  },
  {
    id: 'source-file-types',
    categoryId: 'projects',
    title: 'Phân loại file nguồn',
    description: 'Tab Nguồn truyện — badge loại file, xung đột số chương.',
    keywords: [
      'nguồn truyện',
      'source',
      'phân loại',
      'unknown',
      'xung đột',
      'classified',
    ],
    order: 0.8,
    relatedIds: ['import-novel', 'new-chapters', 'book-metadata-prep', 'modified-source'],
    blocks: [
      { type: 'heading', level: 1, text: 'Phân loại file nguồn' },
      {
        type: 'paragraph',
        text: 'Tab Nguồn truyện hiển thị thư mục TXT gắn với dự án: quét, theo dõi thay đổi, và tóm tắt file metadata / chương / tài liệu phụ sau mỗi lần quét.',
      },
      { type: 'heading', level: 2, text: 'Nhãn (badge) thường gặp' },
      {
        type: 'list',
        items: [
          'Thông tin truyện — _BOOK_INFO.txt',
          'Tóm tắt / Lời tác giả / Lời nói đầu — tài liệu phụ',
          'Chương mở đầu — PROLOGUE',
          'Chương — số chương bình thường',
          'Ngoại truyện / Chương kết',
          'Chưa phân loại — UNKNOWN',
        ],
      },
      { type: 'heading', level: 2, text: 'Thống kê sau quét' },
      {
        type: 'table',
        headers: ['Chỉ số', 'Ý nghĩa'],
        rows: [
          ['Tổng file', 'Mọi file .txt trong thư mục'],
          ['File chương nhận diện', 'Chương thường + mở đầu + ngoại truyện…'],
          ['Mới / Sửa / Mất', 'So với lần quét trước trong DB'],
          ['Xung đột', 'Số chương file vs tiêu đề nội dung không khớp'],
          ['Lỗi', 'File đọc lỗi hoặc phân loại UNKNOWN'],
        ],
      },
      { type: 'heading', level: 2, text: 'Các thao tác' },
      {
        type: 'list',
        items: [
          'Đồng bộ ngay — quét lại toàn bộ thư mục (metadata + chương)',
          'Nhập chương mới — chỉ import file chương chưa có trong DB',
          'Mở thư mục — mở Explorer tại folder nguồn',
          'Cài đặt — bật/tắt theo dõi folder, tự nhập, tự xếp hàng dịch',
        ],
      },
      {
        type: 'paragraph',
        text: 'Nếu tên file (001.txt) và tiêu đề trong nội dung (第二章) không khớp, Khepree Novel AI cảnh báo "Xung đột số chương". Chọn dùng tên file, dùng nội dung, hoặc chỉnh thủ công — không tự chọn im lặng.',
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'File bắt đầu bằng _ luôn ưu tiên metadata/tài liệu. Đặt tên chương dạng 000001.txt để tránh nhầm với tài liệu phụ.',
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Metadata khi quét lại',
        body: 'Quét lại cập nhật metadata từ _BOOK_INFO.txt trừ các trường bạn đã sửa trong tab Thông tin truyện. Xem lại tab đó sau khi đổi file metadata nguồn.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Nhập truyện / thư mục', to: '/help/import-novel' },
          { label: 'Chương mới trong folder', to: '/help/new-chapters' },
        ],
      },
    ],
  },
  {
    id: 'book-profile',
    categoryId: 'notebook',
    title: 'Book Profile và file Notebook',
    description: 'Metadata compact gửi AI — tách khỏi trạng thái truyện khi dịch.',
    keywords: [
      'book profile',
      '00_BOOK_PROFILE',
      'notebook',
      'metadata',
      'translation pack',
      'tóm tắt chính thức',
      'story state',
    ],
    order: 0.5,
    relatedIds: ['project-info', 'notebook', 'google-drive', 'novel-memory'],
    blocks: [
      { type: 'heading', level: 1, text: 'Book Profile và file Notebook' },
      {
        type: 'paragraph',
        text: 'Book Profile là bản tóm tắt metadata ngắn gọn (tên, tác giả, thể loại, mô tả rút gọn…) dùng khi dịch và đồng bộ lên Notebook. Khepree Novel AI không gửi nguyên mô tả dài mỗi batch — giảm token và giữ ngữ cảnh ổn định.',
      },
      { type: 'heading', level: 2, text: 'File trên Google Drive' },
      {
        type: 'table',
        headers: ['File', 'Nội dung'],
        rows: [
          ['00_BOOK_PROFILE.md', 'Metadata truyện — cập nhật từ tab Thông tin truyện'],
          ['01_TRANSLATION_RULES.md', 'Quy tắc dịch dự án'],
          ['02_PROJECT_TERMS.md', 'Thuật ngữ'],
          ['03_CHARACTERS.md', 'Nhân vật'],
          ['04_RELATIONSHIPS.md', 'Quan hệ / xưng hô'],
          ['05_STORY_STATE.md', 'Trạng thái cốt truyện khi dịch — cập nhật theo batch'],
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Không trộn hai loại tóm tắt',
        body: 'Tóm tắt chính thức (official summary từ nguồn) nằm trong Book Profile / metadata dự án. Trạng thái truyện đang dịch (ai ở đâu, tình tiết mới…) nằm ở 05_STORY_STATE.md và bảng story_states — hai lớp dữ liệu khác nhau.',
      },
      { type: 'heading', level: 2, text: 'Luồng đồng bộ' },
      {
        type: 'steps',
        steps: [
          {
            title: 'Nhập hoặc sửa metadata',
            body: 'Wizard, _BOOK_INFO.txt, hoặc tab Thông tin truyện.',
          },
          {
            title: 'Đồng bộ Notebook',
            body: 'Nút trên tab Thông tin truyện ghi 00_BOOK_PROFILE.md lên Drive.',
          },
          {
            title: 'Provision Notebook',
            body: 'NotebookLM đọc các file Drive làm nguồn — Book Profile luôn là file đầu tiên trong bộ.',
          },
          {
            title: 'Khi dịch',
            body: 'Translation Pack chèn block [BOOK PROFILE] compact; story state cập nhật riêng sau mỗi batch.',
          },
        ],
      },
      {
        type: 'actions',
        items: [
          { label: 'Tab Thông tin truyện', to: '/help/project-info' },
          { label: 'Kết nối Drive', to: '/help/google-drive' },
          { label: 'Bộ nhớ truyện', to: '/help/novel-memory' },
        ],
      },
    ],
  },
];
