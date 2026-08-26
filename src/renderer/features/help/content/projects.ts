import type { HelpArticle } from '../types';

export const projectArticles: HelpArticle[] = [
  {
    id: 'create-project',
    categoryId: 'projects',
    title: 'Tạo dự án mới',
    description: 'Tạo dự án và các trường thông tin cơ bản.',
    keywords: ['dự án', 'tạo', 'mới', 'truyện', 'thể loại'],
    order: 1,
    relatedIds: ['import-novel', 'book-metadata-prep', 'quick-start'],
    blocks: [
      { type: 'heading', level: 1, text: 'Tạo dự án mới' },
      {
        type: 'paragraph',
        text: 'Trên trang Dự án, nhấn Tạo dự án, chọn thư mục chứa các file TXT (mỗi chương một file), quét và xác nhận nhập. Nếu có _BOOK_INFO.txt hoặc file metadata khác, NovelTrans hiển thị preview thông tin truyện trước khi nhập.',
      },
      { type: 'heading', level: 2, text: 'Wizard tạo dự án (thư mục)' },
      {
        type: 'steps',
        steps: [
          { title: 'Thông tin dự án', body: 'Tên (bắt buộc), tên Trung, thể loại, tài khoản worker — có thể bổ sung sau ở tab Thông tin truyện.' },
          { title: 'Chọn thư mục', body: 'Folder chứa file TXT; quét phát hiện _BOOK_INFO, tài liệu phụ, 序章…' },
          { title: 'Xem trước', body: 'Preview metadata (nếu có), số chương mở đầu/thường, danh sách file sẽ nhập.' },
          { title: 'Xác nhận', body: 'Nhập vào SQLite — metadata, documents và chapters tách riêng.' },
        ],
      },
      { type: 'heading', level: 2, text: 'Thông tin dự án' },
      {
        type: 'list',
        items: [
          'Tên truyện — tên hiển thị khi quản lý và dịch (bắt buộc)',
          'Tên tiếng Trung / thể loại — tuỳ chọn; có thể điền sau hoặc đọc từ _BOOK_INFO.txt',
          'Ngôn ngữ nguồn / đích — mặc định Trung → Việt',
          'Mô tả, tóm tắt — lưu metadata dự án, không gộp vào bảng chương',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Thông tin truyện',
        body: 'Sau khi tạo dự án, mở Thông tin truyện để xem/chỉnh metadata đầy đủ và đồng bộ Book Profile lên Notebook.',
      },
      {
        type: 'actions',
        items: [
          { label: 'Mở Dự án', to: '/projects' },
          { label: 'Chuẩn bị metadata', to: '/help/book-metadata-prep' },
        ],
      },
    ],
  },
  {
    id: 'import-novel',
    categoryId: 'projects',
    title: 'Nhập truyện',
    description: 'Nhập TXT, EPUB, DOCX và quy trình xem trước.',
    keywords: ['nhập', 'import', 'txt', 'epub', 'docx', 'file'],
    order: 2,
    relatedIds: ['chapter-split', 'create-project', 'book-metadata-prep', 'prologue-preface'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nhập truyện' },
      {
        type: 'paragraph',
        text: 'NovelTrans khuyến nghị mỗi chương là một file TXT trong cùng thư mục (ví dụ 000001.txt …). Có thể thêm _BOOK_INFO.txt, _SUMMARY.txt, 序章.txt — phần mềm tự phân loại metadata, tài liệu phụ và chương mở đầu. Trên trang Dự án: Tạo dự án → chọn thư mục → Quét → xem preview → Nhập.',
      },
      {
        type: 'steps',
        steps: [
          { title: 'Chọn tệp', body: 'Chọn file nguồn. Phần mềm tự nhận mã hóa UTF-8 / BOM / GB18030.' },
          { title: 'Xem trước / tách chương', body: 'Kiểm tra danh sách chương, chỉnh tiêu đề, loại trừ chương hoặc thêm điểm tách thủ công.' },
          { title: 'Xác nhận nhập', body: 'Đặt tên dự án và xác nhận. Metadata (nếu có) và chương được lưu riêng. ID đoạn dạng [C000001:P000001] hoặc [PROLOGUE:P000001] — chưa dịch ở bước này.' },
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        title: 'Legacy',
        body: 'Vẫn có thể dùng Nhập từ file (một file TXT/EPUB/DOCX lớn) cho dự án cũ — source_mode LEGACY_IMPORT cho đến khi gắn thư mục nguồn.',
      },
      {
        type: 'callout',
        variant: 'warning',
        title: 'Lưu ý',
        body: 'Luôn kiểm tra số chương trước khi bắt đầu dịch bộ truyện lớn. Sửa tách chương trong bước xem trước dễ hơn sau khi đã dịch.',
      },
    ],
  },
  {
    id: 'chapter-split',
    categoryId: 'projects',
    title: 'Kiểm tra và chia chương',
    description: 'Nhận diện chương tự động và tách thủ công.',
    keywords: ['chương', 'chia', 'tách', 'split', '第一章', 'preview'],
    order: 3,
    relatedIds: ['import-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Kiểm tra và chia chương' },
      {
        type: 'paragraph',
        text: 'NovelTrans cố nhận dạng tiêu đề chương kiểu 第一章, 第100章, 第一卷, v.v. Mức tin cậy hiển thị trong bước xem trước.',
      },
      {
        type: 'paragraph',
        text: 'Nếu chia chưa đúng: dùng Tách thủ công (vị trí ký tự), Nhận diện lại, hoặc sửa tiêu đề / loại trừ chương rồi Áp dụng.',
      },
      {
        type: 'callout',
        variant: 'tip',
        title: 'Mẹo',
        body: 'Cờ trùng tiêu đề hoặc trùng hash giúp phát hiện chương trùng lặp trước khi nhập.',
      },
    ],
  },
  {
    id: 'new-chapters',
    categoryId: 'projects',
    title: 'Khi truyện có chương mới',
    description: 'Thêm file chương mới vào thư mục nguồn.',
    keywords: ['chương mới', 'folder', 'theo dõi', 'quét'],
    order: 4,
    relatedIds: ['import-novel', 'create-project', 'source-file-types'],
    blocks: [
      { type: 'heading', level: 1, text: 'Khi truyện có chương mới' },
      {
        type: 'paragraph',
        text: 'Không cần tạo dự án mới. Chỉ cần đặt file chương mới (ví dụ 000501.txt) vào thư mục nguồn của truyện. NovelTrans phát hiện khi đang chạy hoặc khi mở lại (tùy cài đặt).',
      },
      {
        type: 'list',
        items: [
          'Chỉ thông báo',
          'Tự nhập chương',
          'Tự đưa vào hàng chờ dịch',
          'Tự bắt đầu dịch (khi worker sẵn sàng)',
        ],
      },
    ],
  },
  {
    id: 'modified-source',
    categoryId: 'projects',
    title: 'Nếu bạn sửa file chương cũ',
    description: 'Xử lý khi nguồn thay đổi.',
    keywords: ['sửa file', 'thay đổi', 'dịch lại'],
    order: 5,
    relatedIds: ['import-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nếu bạn sửa file chương cũ' },
      {
        type: 'paragraph',
        text: 'NovelTrans phát hiện file đã thay đổi. Bản dịch cũ không bị xóa tự động. Bạn có thể giữ bản dịch, xem thay đổi, hoặc đánh dấu dịch lại.',
      },
    ],
  },
  {
    id: 'missing-source',
    categoryId: 'projects',
    title: 'Nếu file chương bị xóa',
    description: 'File nguồn mất nhưng dữ liệu DB vẫn giữ.',
    keywords: ['xóa file', 'missing', 'mất file'],
    order: 6,
    relatedIds: ['import-novel'],
    blocks: [
      { type: 'heading', level: 1, text: 'Nếu file chương bị xóa' },
      {
        type: 'paragraph',
        text: 'NovelTrans không tự xóa bản dịch. Chương được đánh dấu "Không tìm thấy file nguồn." Đặt file lại vào folder để khôi phục.',
      },
    ],
  },
];
