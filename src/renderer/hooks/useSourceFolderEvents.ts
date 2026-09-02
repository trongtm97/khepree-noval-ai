import { useEffect } from 'react';
import type { SourceFolderEventDto } from '@shared/schemas/source-folder';
import { useNotificationStore } from '../stores/notification-store';

function mapEventKind(event: SourceFolderEventDto): 'SUCCESS' | 'INFO' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED' {
  switch (event.type) {
    case 'chapters_imported':
      return 'SUCCESS';
    case 'scan_progress':
    case 'scan_completed':
      return 'INFO';
    case 'new_chapters':
      return 'INFO';
    case 'modified_chapter':
    case 'missing_chapter':
      return 'WARNING';
    case 'conflict':
      return 'ACTION_REQUIRED';
    case 'folder_unavailable':
      return 'ERROR';
    default:
      return 'INFO';
  }
}

function mapEventTitle(event: SourceFolderEventDto): string {
  switch (event.type) {
    case 'chapters_imported':
      return 'Đã nhập chương mới';
    case 'new_chapters':
      return 'Phát hiện chương mới';
    case 'modified_chapter':
      return 'Nguồn chương đã thay đổi';
    case 'missing_chapter':
      return 'Thiếu chương';
    case 'conflict':
      return 'Phát hiện xung đột chương';
    case 'folder_unavailable':
      return 'Không thể truy cập thư mục nguồn';
    case 'scan_completed':
      return 'Quét thư mục hoàn tất';
    default:
      return 'Nguồn truyện';
  }
}

export function useSourceFolderEvents(): void {
  const add = useNotificationStore((s) => s.add);

  useEffect(() => {
    const unsubscribe = window.khepreeNovelAI.sourceFolder.onEvent((event) => {
      if (event.type === 'scan_progress') return;
      add({
        kind: mapEventKind(event),
        title: mapEventTitle(event),
        description: event.message,
        projectId: event.projectId,
        toast: ['SUCCESS', 'WARNING', 'ERROR', 'ACTION_REQUIRED'].includes(mapEventKind(event)),
      });
    });
    return unsubscribe;
  }, [add]);
}
