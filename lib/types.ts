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
  keySource?: 'vault' | 'passkey' | 'seed';
  noteCiphertext?: string;
  noteIv?: string;
  noteEncoding?: 'utf-8';
  noteLength?: number;
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

export type AddressStatsRecord = {
  address: string;
  sentFiles: number;
  sentBytes: number;
  receivedFiles: number;
  receivedBytes: number;
  totalR1Burned: string;
  updatedAt: number;
};

export type PlatformStatsRecord = {
  totalSentFiles: number;
  totalBytesSent: number;
  uniqueUsers: number;
  totalR1Burned: string;
  updatedAt: number;
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
  minR1WithSlippage: bigint;
  wethAddress?: `0x${string}`;
  wethAmount?: bigint;
  wethDecimals?: number;
  maxWethWithSlippage?: bigint;
};

export type UserProfile = {
  handle?: string; // e.g., alice.3send
  publicKeyPem?: string;
  fingerprintHex?: string;
  keyCreatedAt?: number;
  keyLabel?: string; // user-defined label for the key pair
  seedMnemonic?: string; // locally stored recovery phrase (never synced)
};

export type VaultKeyRecord = {
  publicKey: string;
  privateKey: string;
  createdAt?: number;
  passkeyPublicKey?: string;
  passkeyCredentialId?: string;
  passkeyPrfSalt?: string;
};

export type RegisteredKeyType = 'passkey' | 'seed';

type RegisteredKeyRecordBase = {
  type: RegisteredKeyType;
  publicKey: string;
  createdAt: number;
  label?: string;
};

export type RegisteredPasskeyRecord = RegisteredKeyRecordBase & {
  type: 'passkey';
  credentialId: string;
  prfSalt: string;
  algorithm?: number;
};

export type RegisteredSeedRecord = RegisteredKeyRecordBase & {
  type: 'seed';
  fingerprint?: string;
  derivationPath?: string;
};

export type RegisteredKeyRecord = RegisteredPasskeyRecord | RegisteredSeedRecord;

export type PasskeyRecord = RegisteredPasskeyRecord;
