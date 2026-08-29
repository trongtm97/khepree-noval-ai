import fs from 'node:fs';
import type { SystemHealthResult } from '@shared/schemas/system-health';
import { assessBrowserDependencyHealth } from '../automation/browser-runner/browser-dependency-health';
import { getAiProviderService } from '../ai/ai-provider-singleton';
import { workerProcessManager } from '../ai/worker-process-manager';
import type { DatabaseManager } from '../db/database-manager';
import { getBackupDirectory } from '../portability/backup-directory';
import { validateExportDirectory } from '../portability/export-directory-validator';
import { getDefaultExportDirectoryInfo } from '../portability/export-settings-service';
import { pathsService } from './paths-service';

function summarizeResult(steps: SystemHealthResult['steps']): Pick<SystemHealthResult, 'ok' | 'passedCount' | 'totalCount' | 'title' | 'message'> {
  const passedCount = steps.filter((s) => s.ok).length;
  const totalCount = steps.length;
  const ok = passedCount === totalCount;
  if (ok) {
    return {
      ok: true,
      passedCount,
      totalCount,
      title: `✓ ${passedCount}/${totalCount} thành phần hoạt động`,
      message: 'Hệ thống sẵn sàng.',
    };
  }
  const failed = totalCount - passedCount;
  return {
    ok: false,
    passedCount,
    totalCount,
    title: `${failed} vấn đề cần xử lý`,
    message: 'Xem chi tiết từng thành phần bên dưới.',
  };
}

export function runSystemHealthCheck(db: DatabaseManager): SystemHealthResult {
  const steps: SystemHealthResult['steps'] = [];

  try {
    const schemaVersion = db.getSchemaVersion();
    steps.push({
      id: 'database',
      ok: schemaVersion > 0,
      message: schemaVersion > 0 ? `CSDL v${schemaVersion}` : 'CSDL chưa sẵn sàng',
    });
  } catch (error) {
    steps.push({
      id: 'database',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const root = pathsService.getPath('root');
    const data = pathsService.getPath('data');
    const ok = fs.existsSync(root) && fs.existsSync(data);
    steps.push({
      id: 'app_storage',
      ok,
      message: ok ? 'Thư mục dữ liệu ứng dụng OK' : 'Thiếu thư mục dữ liệu',
    });
  } catch (error) {
    steps.push({
      id: 'app_storage',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const browser = assessBrowserDependencyHealth('AUTO');
  steps.push({
    id: 'browser',
    ok: browser.browserUsable,
    message: browser.message,
  });

  try {
    const ai = getAiProviderService();
    const list = ai.listProviders().providers.filter((p) => p.enabled);
    const ready = list.some((p) => p.status === 'READY');
    const workerOk = workerProcessManager.detectInstall().ok;
    steps.push({
      id: 'ai',
      ok: ready || workerOk,
      message: ready
        ? 'Nhà cung cấp AI sẵn sàng'
        : workerOk
          ? 'Worker đã cài — cần kiểm tra tài khoản'
          : 'Chưa có nhà cung cấp AI sẵn sàng',
    });
  } catch (error) {
    steps.push({
      id: 'ai',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const exportInfo = getDefaultExportDirectoryInfo(db);
  if (!exportInfo.directory) {
    steps.push({
      id: 'export',
      ok: false,
      message: 'Chưa thiết lập thư mục xuất',
    });
  } else {
    const exportCheck = validateExportDirectory(exportInfo.directory);
    steps.push({
      id: 'export',
      ok: exportCheck.valid,
      message: exportCheck.valid ? 'Thư mục xuất ghi được' : `Xuất: ${exportCheck.error ?? 'INACCESSIBLE'}`,
    });
  }

  const backupDir = getBackupDirectory(db, pathsService.getPath('backups')).directory;
  const backupCheck = validateExportDirectory(backupDir);
  steps.push({
    id: 'backup',
    ok: backupCheck.valid,
    message: backupCheck.valid ? 'Thư mục sao lưu ghi được' : `Sao lưu: ${backupCheck.error ?? 'INACCESSIBLE'}`,
  });

  return {
    ...summarizeResult(steps),
    steps,
  };
}
