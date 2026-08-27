import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_FILENAME } from '@shared/constants/db';
import { MIGRATIONS, migrationChecksum } from './migrations';
import { runMigrations, getCurrentSchemaVersion } from './migration-runner';
import {
  AppMetaRepository,
  ProjectRepository,
  ChapterRepository,
  ParagraphRepository,
  TranslationRepository,
  TermRepository,
  TermCandidateRepository,
  CharacterRepository,
  RelationshipRepository,
  MemoryEventRepository,
  StoryStateRepository,
  MemoryConflictRepository,
  MemoryArchiveRepository,
  LearningEventRepository,
  DriveResourceRepository,
  DriveSyncStateRepository,
  NotebookRepository,
  GeminiRequestRepository,
  AutomationEventRepository,
  JobRepository,
  WorkerStateRepository,
  GoogleAccountRepository,
  SecretsRepository,
  AuditLogRepository,
  ProjectDocumentRepository,
  AiProviderRepository,
  AiAccountRepository,
  AiModelRepository,
  KnowledgeFileRepository,
  KnowledgeSyncEventRepository,
  NotebookSourceBindingRepository,
  NotebookHotDeltaRepository,
  FullNovelPreprocessRepository,
  BatchSizeRepository,
} from './repositories';

export interface DatabaseOptions {
  dataDir: string;
  backupsDir: string;
  readonly?: boolean;
}

export class DatabaseManager {
  private db: Database.Database;
  readonly dbPath: string;

  readonly appMeta: AppMetaRepository;
  readonly projects: ProjectRepository;
  readonly chapters: ChapterRepository;
  readonly paragraphs: ParagraphRepository;
  readonly translations: TranslationRepository;
  readonly terms: TermRepository;
  readonly termCandidates: TermCandidateRepository;
  readonly characters: CharacterRepository;
  readonly relationships: RelationshipRepository;
  readonly memoryEvents: MemoryEventRepository;
  readonly storyStates: StoryStateRepository;
  readonly memoryConflicts: MemoryConflictRepository;
  readonly memoryArchives: MemoryArchiveRepository;
  readonly learningEvents: LearningEventRepository;
  readonly driveResources: DriveResourceRepository;
  readonly driveSyncState: DriveSyncStateRepository;
  readonly notebooks: NotebookRepository;
  readonly geminiRequests: GeminiRequestRepository;
  readonly automationEvents: AutomationEventRepository;
  readonly jobs: JobRepository;
  readonly workerStates: WorkerStateRepository;
  readonly googleAccounts: GoogleAccountRepository;
  readonly secrets: SecretsRepository;
  readonly auditLog: AuditLogRepository;
  readonly projectDocuments: ProjectDocumentRepository;
  readonly aiProviders: AiProviderRepository;
  readonly aiAccounts: AiAccountRepository;
  readonly aiModels: AiModelRepository;
  readonly knowledgeFiles: KnowledgeFileRepository;
  readonly knowledgeSyncEvents: KnowledgeSyncEventRepository;
  readonly notebookSourceBindings: NotebookSourceBindingRepository;
  readonly notebookHotDeltas: NotebookHotDeltaRepository;
  readonly fullNovelPreprocess: FullNovelPreprocessRepository;
  readonly batchSize: BatchSizeRepository;

  constructor(options: DatabaseOptions) {
    fs.mkdirSync(options.dataDir, { recursive: true });
    this.dbPath = path.join(options.dataDir, DB_FILENAME);

    this.db = new Database(this.dbPath, {
      readonly: options.readonly ?? false,
      fileMustExist: false,
    });

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    const migrationsWithChecksum = MIGRATIONS.map((m) => ({
      ...m,
      checksum: migrationChecksum(m.sql),
    }));

    runMigrations(this.db, migrationsWithChecksum, {
      dbPath: this.dbPath,
      backupsDir: options.backupsDir,
    });

    this.appMeta = new AppMetaRepository(this.db);
    this.projects = new ProjectRepository(this.db);
    this.chapters = new ChapterRepository(this.db);
    this.paragraphs = new ParagraphRepository(this.db);
    this.translations = new TranslationRepository(this.db);
    this.terms = new TermRepository(this.db);
    this.termCandidates = new TermCandidateRepository(this.db);
    this.characters = new CharacterRepository(this.db);
    this.relationships = new RelationshipRepository(this.db);
    this.memoryEvents = new MemoryEventRepository(this.db);
    this.storyStates = new StoryStateRepository(this.db);
    this.memoryConflicts = new MemoryConflictRepository(this.db);
    this.memoryArchives = new MemoryArchiveRepository(this.db);
    this.learningEvents = new LearningEventRepository(this.db);
    this.driveResources = new DriveResourceRepository(this.db);
    this.driveSyncState = new DriveSyncStateRepository(this.db);
    this.notebooks = new NotebookRepository(this.db);
    this.geminiRequests = new GeminiRequestRepository(this.db);
    this.automationEvents = new AutomationEventRepository(this.db);
    this.jobs = new JobRepository(this.db);
    this.workerStates = new WorkerStateRepository(this.db);
    this.googleAccounts = new GoogleAccountRepository(this.db);
    this.secrets = new SecretsRepository(this.db);
    this.auditLog = new AuditLogRepository(this.db);
    this.projectDocuments = new ProjectDocumentRepository(this.db);
    this.aiProviders = new AiProviderRepository(this.db);
    this.aiAccounts = new AiAccountRepository(this.db);
    this.aiModels = new AiModelRepository(this.db);
    this.knowledgeFiles = new KnowledgeFileRepository(this.db);
    this.knowledgeSyncEvents = new KnowledgeSyncEventRepository(this.db);
    this.notebookSourceBindings = new NotebookSourceBindingRepository(this.db);
    this.notebookHotDeltas = new NotebookHotDeltaRepository(this.db);
    this.fullNovelPreprocess = new FullNovelPreprocessRepository(this.db);
    this.batchSize = new BatchSizeRepository(this.db);

    this.appMeta.set('schema_version', String(getCurrentSchemaVersion(this.db)));
  }

  getConnection(): Database.Database {
    return this.db;
  }

  getSchemaVersion(): number {
    return getCurrentSchemaVersion(this.db);
  }

  close(): void {
    this.db.close();
  }
}

let singleton: DatabaseManager | null = null;

export function initializeDatabase(options: DatabaseOptions): DatabaseManager {
  if (singleton) {
    singleton.close();
  }
  singleton = new DatabaseManager(options);
  return singleton;
}

export function getDatabase(): DatabaseManager {
  if (!singleton) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return singleton;
}

export function closeDatabase(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

/** Test helper — bypass singleton lifecycle. */
export function createDatabaseManager(options: DatabaseOptions): DatabaseManager {
  return new DatabaseManager(options);
}
