export type StoredUploadRecord = {
  cid: string;
  filename: string;
  recipient: string;
  initiator: string;
  note?: string;
  txHash: string;
  filesize: number;
  sentAt: number;
};
