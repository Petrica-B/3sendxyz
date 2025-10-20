export type EncryptionMetadata = {
  version: string;
  algorithm: string;
  keyDerivation?: string;
  ephemeralPublicKey: string;
  iv: string;
  recipientPublicKey?: string;
  plaintextLength?: number;
  ciphertextLength?: number;
  recipient?: string;
  keySource?: 'vault' | 'passkey';
};

export type StoredUploadRecord = {
  cid: string;
  filename: string;
  recipient: string;
  initiator: string;
  note?: string;
  txHash: string;
  filesize: number;
  sentAt: number;
  tierId: number;
  usdcAmount: string;
  r1Amount: string;
  originalFilename?: string;
  originalMimeType?: string;
  originalFilesize?: number;
  encryptedFilesize?: number;
  encryption?: EncryptionMetadata;
};

export type TierConfig = {
  id: number;
  label: string;
  description: string;
  minBytes: number;
  maxBytes: number;
  usd: number;
};

export type QuoteData = {
  usdcAmount: bigint;
  r1Amount: bigint;
  r1Decimals: number;
  maxR1WithSlippage: bigint;
};

export type UserProfile = {
  handle?: string; // e.g., alice.3send
  publicKeyPem?: string;
  fingerprintHex?: string;
  keyCreatedAt?: number;
  keyLabel?: string; // user-defined label for the key pair
};

export type VaultKeyRecord = {
  publicKey: string;
  privateKey: string;
  createdAt?: number;
  passkeyPublicKey?: string;
  passkeyCredentialId?: string;
  passkeyPrfSalt?: string;
};

export type PasskeyRecord = {
  credentialId: string;
  publicKey: string;
  algorithm?: number;
  createdAt: number;
  label?: string;
  prfSalt: string;
};
