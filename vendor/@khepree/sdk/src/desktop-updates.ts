export interface DesktopUpdateArtifact {
  artifactPublicId: string;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface DesktopLatestUpdate {
  releasePublicId: string;
  version: string;
  platform: string;
  architecture: string;
  channel: string;
  mandatoryUpdate: boolean;
  minimumSupportedVersion: string | null;
  publishedAt: string | null;
  releaseNotes: string | null;
  artifacts: DesktopUpdateArtifact[];
}

export interface DesktopLatestUpdateResponse {
  update: DesktopLatestUpdate | null;
}

export interface DesktopUpdateDownloadRequest {
  clientId: string;
  releasePublicId: string;
  artifactPublicId: string;
}

export interface DesktopUpdateDownloadResponse {
  ticketId: string;
  downloadUrl: string;
  expiresAt: string;
  artifactPublicId: string;
}
