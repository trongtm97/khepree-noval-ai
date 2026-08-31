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

export class KhepreeProductAccessDeniedError extends KhepreeAccessError {
  constructor(feature: string) {
    super('PRODUCT_ACCESS_DENIED', `Access denied for feature: ${feature}`);
    this.name = 'KhepreeProductAccessDeniedError';
  }
}
