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
