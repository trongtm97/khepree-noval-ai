import { generateKeyPairSync } from 'node:crypto';
import { isKhepreeDevMockEnabled } from './config';

let devKeys: {
  keyId: string;
  publicKeySpki: string;
  privateKeyPkcs8: string;
} | null = null;

export function getDevSigningKeys(): {
  keyId: string;
  publicKeySpki: string;
  privateKeyPkcs8: string;
} | null {
  if (!isKhepreeDevMockEnabled()) {
    return null;
  }
  if (!devKeys) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    devKeys = {
      keyId: 'dev-local',
      publicKeySpki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      privateKeyPkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    };
  }
  return devKeys;
}
