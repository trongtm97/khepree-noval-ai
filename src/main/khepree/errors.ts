export class KhepreeAccessError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'KhepreeAccessError';
    this.code = code;
  }
}

export class KhepreeNetworkError extends KhepreeAccessError {
  constructor(message = 'Unable to reach Khepree. Check your internet connection.') {
    super('NETWORK_UNAVAILABLE', message);
    this.name = 'KhepreeNetworkError';
  }
}

export class KhepreeLeaseInvalidError extends KhepreeAccessError {
  constructor(message = 'License lease signature or payload is invalid.') {
    super('LEASE_INVALID', message);
    this.name = 'KhepreeLeaseInvalidError';
  }
}

export class KhepreeDeviceLimitError extends KhepreeAccessError {
  readonly devicesUsed: number;
  readonly devicesMax: number;

  constructor(devicesUsed: number, devicesMax: number) {
    super(
      'DEVICE_LIMIT',
      `Device limit reached (${devicesUsed}/${devicesMax}). Remove a device from your Khepree account.`,
    );
    this.name = 'KhepreeDeviceLimitError';
    this.devicesUsed = devicesUsed;
    this.devicesMax = devicesMax;
  }
}

export class KhepreeEntitlementError extends KhepreeAccessError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'KhepreeEntitlementError';
  }
}

export class KhepreeSafeStorageRequiredError extends KhepreeAccessError {
  constructor() {
    super(
      'SAFE_STORAGE_UNAVAILABLE',
      'Secure credential storage is unavailable. Sign in again — credentials cannot be persisted.',
    );
    this.name = 'KhepreeSafeStorageRequiredError';
  }
}

/** Encrypted credential exists but cannot be decrypted or parsed — do not silently re-generate. */
export class KhepreeCredentialCorruptError extends KhepreeAccessError {
  readonly credential: 'device_private_key' | 'refresh_token';

  constructor(credential: 'device_private_key' | 'refresh_token') {
    const message =
      credential === 'device_private_key'
        ? 'Device credentials are corrupted. Sign out, remove this device from your Khepree account, then sign in again.'
        : 'Session credentials are corrupted. Sign out and sign in again.';
    super('CREDENTIAL_CORRUPT', message);
    this.name = 'KhepreeCredentialCorruptError';
    this.credential = credential;
  }
}

export class KhepreeApiResponseInvalidError extends KhepreeAccessError {
  constructor(context: string) {
    super('API_RESPONSE_INVALID', `Khepree API returned invalid data: ${context}`);
    this.name = 'KhepreeApiResponseInvalidError';
  }
}

export class KhepreeProductAccessDeniedError extends KhepreeAccessError {
  constructor(feature: string) {
    super('PRODUCT_ACCESS_DENIED', `Access denied for feature: ${feature}`);
    this.name = 'KhepreeProductAccessDeniedError';
  }
}
