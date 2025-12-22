import { jsonWithServer } from '@/lib/api';
import {
  FILE_CLEANUP_INDEX_CSTORE_HKEY,
  RECEIVED_FILES_CSTORE_HKEY,
  SENT_FILES_CSTORE_HKEY,
  USED_PAYMENT_TXS_CSTORE_HKEY,
  resolveTierBySize,
} from '@/lib/constants';
import { consumeFreeSend, isFreePaymentReference, isMicroTier } from '@/lib/freeSends';
import {
  buildSendHandshakeMessage,
  computeEncryptionMetadataDigest,
  parseSendHandshakeMessage,
} from '@/lib/handshake';
import { Manager3sendAbi } from '@/lib/SmartContracts';
import { PLATFORM_STATS_CACHE_TAG, updateStatsAfterUpload } from '@/lib/stats';
import { createStepTimers } from '@/lib/timers';
import type { EncryptionMetadata, FileCleanupIndexEntry, StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import Busboy from 'busboy';
import { revalidateTag } from 'next/cache';
import { PassThrough, Readable } from 'node:stream';
import {
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  isErc6492Signature,
  verifyMessage,
} from 'viem';
import { base, baseSepolia, type Chain } from 'viem/chains';

function getRpcUrl(chainId: number): { chain: Chain; rpcUrl: string } | null {
  const chain = chainId === base.id ? base : chainId === baseSepolia.id ? baseSepolia : null;
  if (!chain) return null;
  const override =
    chain.id === base.id
      ? process.env.RPC_URL_BASE
      : chain.id === baseSepolia.id
        ? process.env.RPC_URL_BASE_SEPOLIA
        : undefined;
  const rpcUrl = override ?? chain.rpcUrls.default.http?.[0];
  if (!rpcUrl) {
    throw new Error('Missing RPC URL for selected chain');
  }
  return { chain, rpcUrl };
}

type MultipartFile = {
  stream: NodeJS.ReadableStream;
  filename: string;
  mimeType: string;
};

type ParsedMultipart = {
  fields: Record<string, string>;
  file: MultipartFile;
  finished: Promise<void>;
};

async function parseMultipartRequest(request: Request): Promise<ParsedMultipart> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new Error('Expected multipart/form-data');
  }

  const body = request.body;
  if (!body) {
    throw new Error('Missing request body');
  }

  const fields: Record<string, string> = {};
  let fileFound = false;
  let resolveFile: (file: MultipartFile) => void = () => {};
  let rejectFile: (error: Error) => void = () => {};
  let resolveFinished: () => void = () => {};
  let rejectFinished: (error: Error) => void = () => {};

  const filePromise = new Promise<MultipartFile>((resolve, reject) => {
    resolveFile = resolve;
    rejectFile = reject;
  });

  const finished = new Promise<void>((resolve, reject) => {
    resolveFinished = resolve;
    rejectFinished = reject;
  });

  const busboy = Busboy({ headers: Object.fromEntries(request.headers) });

  busboy.on('field', (name, value) => {
    if (typeof value === 'string') {
      fields[name] = value;
    }
  });

  busboy.on('file', (name, stream, info) => {
    if (name !== 'file') {
      stream.resume();
      return;
    }
    if (fileFound) {
      stream.resume();
      return;
    }
    fileFound = true;
    stream.pause();
    resolveFile({
      stream,
      filename: info?.filename || 'file',
      mimeType: info?.mimeType || 'application/octet-stream',
    });
  });

  busboy.on('error', (error) => {
    rejectFile(error as Error);
    rejectFinished(error as Error);
  });

  busboy.on('finish', () => {
    if (!fileFound) {
      const error = new Error('Missing file');
      rejectFile(error);
      rejectFinished(error);
      return;
    }
    resolveFinished();
  });

  const nodeStream = Readable.fromWeb(body as any);
  nodeStream.on('error', (error) => {
    rejectFile(error);
    rejectFinished(error);
  });
  nodeStream.pipe(busboy);

  const file = await filePromise;
  return { fields, file, finished };
}

async function drainFileStream(
  stream: NodeJS.ReadableStream,
  finished: Promise<void>
): Promise<void> {
  stream.on('error', () => {});
  stream.resume();
  stream.on('data', () => {});
  try {
    await finished;
  } catch {}
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const timers = createStepTimers();
  const endInitialVerification = timers.start('initialVerification');
  let parsedMultipart: ParsedMultipart | null = null;
  let uploadStarted = false;

  try {
    parsedMultipart = await parseMultipartRequest(request);
    const { fields, file, finished } = parsedMultipart;
    const recipient = fields.recipient;
    const initiator = fields.initiator;
    const note = fields.note;
    const handshakeMessageRaw = fields.handshakeMessage;
    const signatureRaw = fields.signature;
    const sentAtRaw = fields.sentAt;
    const paymentTxHashRaw = fields.paymentTxHash;
    const paymentAssetRaw = fields.paymentAsset;
    const paymentTypeRaw = fields.paymentType;
    const chainIdRaw = fields.chainId;
    const tierIdRaw = fields.tierId;
    const originalSizeRaw = fields.originalSize;
    const originalFilenameRaw = fields.originalFilename;
    const originalMimeTypeRaw = fields.originalMimeType;
    const encryptionRaw = fields.encryption;

    const fail = (message: string, status = 400) => {
      if (!uploadStarted) {
        file.stream.on('error', () => {});
        file.stream.on('data', () => {});
        file.stream.resume();
      }
      return jsonWithServer({ success: false, error: message }, { status });
    };

    if (typeof recipient !== 'string' || recipient.trim().length === 0) {
      return fail('Missing recipient', 400);
    }

    const recipientAddress = recipient.trim();
    if (!isAddress(recipientAddress)) {
      return fail('Invalid recipient address', 400);
    }

    if (typeof initiator !== 'string' || initiator.trim().length === 0) {
      return fail('Missing initiator', 400);
    }

    const initiatorAddress = initiator.trim();
    if (!isAddress(initiatorAddress)) {
      return fail('Invalid initiator address', 400);
    }

    if (typeof handshakeMessageRaw !== 'string' || handshakeMessageRaw.trim().length === 0) {
      return fail('Missing handshakeMessage', 400);
    }

    if (typeof signatureRaw !== 'string' || signatureRaw.trim().length === 0) {
      return fail('Missing signature', 400);
    }

    if (!signatureRaw.trim().startsWith('0x')) {
      return fail('Invalid signature format', 400);
    }

    if (typeof paymentTxHashRaw !== 'string' || paymentTxHashRaw.trim().length === 0) {
      return fail('Missing paymentTxHash', 400);
    }
    const paymentTxHashProvided = paymentTxHashRaw.trim().toLowerCase();

    const handshakeMessage = handshakeMessageRaw.replace(/\r\n/g, '\n').trim();
    if (handshakeMessage.length === 0) {
      return fail('Missing handshakeMessage', 400);
    }
    const signature = signatureRaw.trim() as `0x${string}`;
    const paymentTxHash = paymentTxHashProvided;

    const chainId = typeof chainIdRaw === 'string' ? Number(chainIdRaw) : Number(chainIdRaw ?? NaN);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return fail('Missing chainId', 400);
    }

    let parsedOriginalSize: number | null = null;
    if (typeof originalSizeRaw === 'string' && originalSizeRaw.trim().length > 0) {
      const parsed = Number.parseInt(originalSizeRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        parsedOriginalSize = parsed;
      }
    } else if (
      typeof originalSizeRaw === 'number' &&
      Number.isFinite(originalSizeRaw) &&
      originalSizeRaw > 0
    ) {
      parsedOriginalSize = Math.floor(originalSizeRaw);
    }

    let encryptionMetadata: EncryptionMetadata | undefined;
    if (typeof encryptionRaw === 'string' && encryptionRaw.trim().length > 0) {
      try {
        const parsed = JSON.parse(encryptionRaw) as EncryptionMetadata;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('invalid');
        }
        if (typeof parsed.version !== 'string' || parsed.version.trim().length === 0) {
          throw new Error('invalid');
        }
        if (typeof parsed.algorithm !== 'string' || parsed.algorithm.trim().length === 0) {
          throw new Error('invalid');
        }
        if (typeof parsed.ephemeralPublicKey !== 'string' || typeof parsed.iv !== 'string') {
          throw new Error('invalid');
        }
        encryptionMetadata = parsed;
      } catch {
        return fail('Invalid encryption metadata', 400);
      }
    }

    if (!encryptionMetadata) {
      return fail('Missing encryption metadata', 400);
    }

    const metadataPlaintextLength =
      Number.isFinite(encryptionMetadata.plaintextLength) &&
      (encryptionMetadata.plaintextLength as number) > 0
        ? Math.floor(encryptionMetadata.plaintextLength as number)
        : undefined;
    const metadataCiphertextLength =
      Number.isFinite(encryptionMetadata.ciphertextLength) &&
      (encryptionMetadata.ciphertextLength as number) > 0
        ? Math.floor(encryptionMetadata.ciphertextLength as number)
        : undefined;

    const effectiveFileSize = parsedOriginalSize ?? metadataPlaintextLength;
    if (!effectiveFileSize || !Number.isFinite(effectiveFileSize) || effectiveFileSize <= 0) {
      return fail('Missing original size', 400);
    }

    const expectedTier = resolveTierBySize(effectiveFileSize);
    if (!expectedTier) {
      return fail('File exceeds maximum allowed size', 400);
    }

    if (typeof tierIdRaw === 'string' && Number(tierIdRaw) !== expectedTier.id) {
      return fail('Tier mismatch', 400);
    }

    if (
      Number.isFinite(metadataPlaintextLength) &&
      (metadataPlaintextLength as number) > 0 &&
      Math.floor(metadataPlaintextLength as number) !== effectiveFileSize
    ) {
      return fail('Plaintext size mismatch', 400);
    }

    const originalFilename =
      typeof originalFilenameRaw === 'string' && originalFilenameRaw.trim().length > 0
        ? originalFilenameRaw
        : undefined;
    const originalMimeType =
      typeof originalMimeTypeRaw === 'string' && originalMimeTypeRaw.trim().length > 0
        ? originalMimeTypeRaw
        : undefined;

    const recipientKey = recipientAddress.toLowerCase();
    const initiatorAddr = initiatorAddress.toLowerCase();

    const preliminarySentAt =
      typeof sentAtRaw === 'string'
        ? Number(sentAtRaw)
        : typeof sentAtRaw === 'number'
          ? Number(sentAtRaw)
          : Number.NaN;
    const sentTimestampCandidate = Number.isFinite(preliminarySentAt)
      ? Math.floor(preliminarySentAt)
      : Date.now();
    let sentTimestamp = sentTimestampCandidate;

    let parsedHandshake;
    try {
      parsedHandshake = parseSendHandshakeMessage(handshakeMessage);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'invalid format';
      return fail(`Invalid handshake message: ${detail}`, 400);
    }

    if (
      typeof metadataCiphertextLength === 'number' &&
      metadataCiphertextLength > 0 &&
      parsedHandshake.ciphertextBytes !== metadataCiphertextLength
    ) {
      return fail('Handshake ciphertext size mismatch', 400);
    }

    const expectedCiphertextBytes =
      typeof metadataCiphertextLength === 'number' && metadataCiphertextLength > 0
        ? metadataCiphertextLength
        : parsedHandshake.ciphertextBytes;
    if (!Number.isFinite(expectedCiphertextBytes) || expectedCiphertextBytes <= 0) {
      return fail('Missing ciphertext size', 400);
    }

    if (parsedHandshake.sender !== initiatorAddr) {
      return fail('Handshake sender mismatch', 400);
    }
    if (parsedHandshake.recipient !== recipientKey) {
      return fail('Handshake recipient mismatch', 400);
    }
    if (parsedHandshake.chainId !== chainId) {
      return fail('Handshake chain mismatch', 400);
    }
    if (parsedHandshake.paymentTxHash !== paymentTxHash) {
      return fail('Handshake payment hash mismatch', 400);
    }
    if (parsedHandshake.tierId !== expectedTier.id) {
      return fail('Handshake tier mismatch', 400);
    }
    if (parsedHandshake.plaintextBytes !== effectiveFileSize) {
      return fail('Handshake plaintext size mismatch', 400);
    }
    if (parsedHandshake.ciphertextBytes !== expectedCiphertextBytes) {
      return fail('Handshake ciphertext size mismatch', 400);
    }

    const expectedMetadataDigest = computeEncryptionMetadataDigest(encryptionMetadata);
    if (parsedHandshake.metadataDigest !== expectedMetadataDigest) {
      return fail('Handshake metadata mismatch', 400);
    }

    if (parsedHandshake.sentAtMs !== sentTimestampCandidate) {
      return fail('Handshake timestamp mismatch', 400);
    }
    sentTimestamp = parsedHandshake.sentAtMs;

    const expectedHandshakeMessage = buildSendHandshakeMessage({
      initiator: initiatorAddr,
      recipient: recipientKey,
      chainId,
      paymentTxHash,
      sentAt: sentTimestamp,
      tierId: expectedTier.id,
      plaintextBytes: effectiveFileSize,
      ciphertextBytes: expectedCiphertextBytes,
      originalFilename: originalFilename ?? file.filename,
      encryption: encryptionMetadata,
    });

    if (expectedHandshakeMessage !== handshakeMessage) {
      return fail('Handshake message mismatch', 400);
    }

    const normalizedPaymentType =
      typeof paymentTypeRaw === 'string' && paymentTypeRaw.toUpperCase() === 'FREE'
        ? 'FREE'
        : 'PAID';
    let paymentAsset =
      typeof paymentAssetRaw === 'string' && paymentAssetRaw.trim().length > 0
        ? paymentAssetRaw.trim().toUpperCase()
        : undefined;
    const isFreePayment = isFreePaymentReference(paymentTxHash);

    if (!isFreePayment && normalizedPaymentType === 'FREE') {
      return fail('Payment type mismatch for paid transfer', 400);
    }

    if (isFreePayment && !isMicroTier(expectedTier.id)) {
      return fail('Free micro-sends only apply to the smallest tier', 400);
    }

    if (!isFreePayment && !paymentTxHash.startsWith('0x')) {
      return fail('Invalid paymentTxHash for paid transfer', 400);
    }

    if (isFreePayment) {
      paymentAsset = 'FREE';
    }

    const rpcDetails = getRpcUrl(chainId);
    if (!rpcDetails) {
      return fail('Unsupported chain', 400);
    }

    const { chain, rpcUrl } = rpcDetails;
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    endInitialVerification();

    const endSignatureVerification = timers.start('signatureVerification');
    let signatureVerified = false;
    try {
      signatureVerified = await client.verifyMessage({
        address: initiatorAddress as `0x${string}`,
        message: handshakeMessage,
        signature,
      });
    } catch (err) {
      console.warn('[upload] Failed smart wallet verification, falling back to EOA', err);
      signatureVerified = await verifyMessage({
        address: initiatorAddress as `0x${string}`,
        message: handshakeMessage,
        signature,
      });
    }
    endSignatureVerification();

    if (!signatureVerified) {
      return fail('Handshake signature mismatch', 400);
    }

    let eventUsdcAmount = 0n;
    let eventR1Amount = 0n;

    if (!isFreePayment) {
      const endPaymentOnchainCheck = timers.start('paymentOnchainCheck');
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({ hash: paymentTxHash as `0x${string}` });
      } catch {
        throw new Error('Payment transaction not found or not yet indexed');
      }

      if (!receipt || receipt.status !== 'success') {
        throw new Error('Payment transaction not confirmed');
      }

      const typedSignature = signature as `0x${string}`;
      const maybeSmartWalletSignature =
        typedSignature.length > 132 || isErc6492Signature(typedSignature);
      if (!maybeSmartWalletSignature) {
        const receiptInitiator = receipt.from?.toLowerCase();
        if (!receiptInitiator || receiptInitiator !== initiatorAddr) {
          throw new Error('Payment transaction initiator does not match sender');
        }
      }

      const paymentLog = receipt.logs
        .map((log) => {
          try {
            return decodeEventLog({
              abi: Manager3sendAbi,
              data: log.data,
              topics: log.topics,
            });
          } catch (error) {
            return null;
          }
        })
        .find((decoded) => decoded?.eventName === 'PaymentProcessed');

      if (!paymentLog || !paymentLog.args) {
        throw new Error('PaymentProcessed event not found in transaction');
      }

      const logTier = Number(paymentLog.args.tier ?? -1);
      if (logTier !== expectedTier.id) {
        throw new Error('Payment tier does not match file size');
      }

      const logSender = String(paymentLog.args.sender ?? '').toLowerCase();
      if (logSender !== initiatorAddr) {
        throw new Error('Payment sender does not match initiator');
      }

      eventUsdcAmount = (paymentLog.args.usdcAmount ?? 0n) as bigint;
      eventR1Amount = (paymentLog.args.r1Amount ?? 0n) as bigint;

      endPaymentOnchainCheck();
    }

    const ratio1 = createEdgeSdk();
    try {
      const endPaymentReuseCheck = timers.start('paymentReuseCheck');
      console.log(`[upload] paymentReuseCheck started at ${Date.now()}`);
      const existingPaymentUsage = await ratio1.cstore.hget({
        hkey: USED_PAYMENT_TXS_CSTORE_HKEY,
        key: paymentTxHash,
      });
      console.log(`[upload] paymentReuseCheck completed at ${Date.now()}`);
      endPaymentReuseCheck();

      if (existingPaymentUsage) {
        return fail('Payment reference already used for upload', 400);
      }
    } catch (err) {
      console.error('[upload] Failed to check payment hash reuse', err);
      throw new Error('Failed to verify payment transaction hash status');
    }

    if (isFreePayment) {
      try {
        const endFreeSendReservation = timers.start('freeSendReservation');
        const { timings } = await consumeFreeSend(initiatorAddr, sentTimestamp, ratio1);
        endFreeSendReservation();
        timers.timings = { ...timers.timings, ...timings };
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Unable to reserve free transfer.';
        return fail(message, 400);
      }
    }
    console.log(`[upload] Starting R1FS upload preparation at ${Date.now()}`);
    const uploadFilename = file.filename || originalFilename || 'file';
    const uploadContentType = file.mimeType || 'application/octet-stream';
    const passThrough = new PassThrough();
    let ciphertextBytes = 0;
    passThrough.on('data', (chunk) => {
      ciphertextBytes += chunk.length;
    });
    file.stream.on('error', (error) => {
      passThrough.destroy(error);
    });
    console.log(`[upload] Completed R1FS upload preparation at ${Date.now()}`);
    const endR1fsUpload = timers.start('r1fsUpload');
    console.log(`[upload] Starting R1FS upload at ${Date.now()}`);
    uploadStarted = true;
    const uploadPromise = ratio1.r1fs.addFile({
      file: passThrough,
      filename: uploadFilename,
      contentType: uploadContentType,
      secret: recipientKey,
    });
    file.stream.pipe(passThrough);
    file.stream.resume();
    let uploadResult;
    try {
      uploadResult = await uploadPromise;
    } catch (err) {
      passThrough.destroy(err as Error);
      throw err;
    }
    console.log(`[upload] Completed R1FS upload at ${Date.now()}`);
    endR1fsUpload();
    await finished;
    const cid = uploadResult.cid;
    if (!cid) {
      throw new Error('Failed to store file in R1FS: ' + JSON.stringify(uploadResult));
    }
    if (ciphertextBytes !== expectedCiphertextBytes) {
      try {
        await ratio1.r1fs.deleteFile({ cid });
      } catch (err) {
        console.error('[upload] Failed to delete mismatched ciphertext', err);
      }
      throw new Error('Ciphertext size mismatch');
    }

    const hasEncryptedNote =
      typeof encryptionMetadata.noteCiphertext === 'string' &&
      encryptionMetadata.noteCiphertext.trim().length > 0 &&
      typeof encryptionMetadata.noteIv === 'string' &&
      encryptionMetadata.noteIv.trim().length > 0;

    const noteValue = typeof note === 'string' && note.trim().length > 0 ? note : undefined;

    const record: StoredUploadRecord = {
      cid,
      filename: originalFilename ?? uploadFilename,
      recipient: recipientKey,
      initiator: initiatorAddr,
      note: hasEncryptedNote ? undefined : noteValue,
      txHash: paymentTxHash,
      filesize: effectiveFileSize,
      sentAt: sentTimestamp,
      tierId: expectedTier.id,
      usdcAmount: eventUsdcAmount.toString(),
      r1Amount: eventR1Amount.toString(),
      paymentType: isFreePayment ? 'free' : 'paid',
      paymentAsset,
      originalFilename: originalFilename ?? uploadFilename,
      originalMimeType,
      originalFilesize: parsedOriginalSize ?? undefined,
      encryptedFilesize: ciphertextBytes,
      encryption: encryptionMetadata,
    };

    const recordJson = JSON.stringify(record);

    await Promise.all([
      async () => {
        const endCstoreWriteReceived = timers.start('cstoreWriteReceived');
        console.log(`[upload] cstoreWriteReceived started at ${Date.now()}`);
        await ratio1.cstore.hset({
          hkey: `${RECEIVED_FILES_CSTORE_HKEY}_${recipientKey}`,
          key: paymentTxHash,
          value: recordJson,
        });
        console.log(`[upload] cstoreWriteReceived completed at ${Date.now()}`);
        endCstoreWriteReceived();
      },
      async () => {
        const endCstoreWriteSent = timers.start('cstoreWriteSent');
        console.log(`[upload] cstoreWriteSent started at ${Date.now()}`);
        await ratio1.cstore.hset({
          hkey: `${SENT_FILES_CSTORE_HKEY}_${initiatorAddr}`,
          key: paymentTxHash,
          value: recordJson,
        });
        console.log(`[upload] cstoreWriteSent completed at ${Date.now()}`);
        endCstoreWriteSent();
      },
      async () => {
        const endCstoreWritePaymentUsed = timers.start('cstoreWritePaymentUsed');
        console.log(`[upload] cstoreWritePaymentUsed started at ${Date.now()}`);
        await ratio1.cstore.hset({
          hkey: USED_PAYMENT_TXS_CSTORE_HKEY,
          key: paymentTxHash,
          value: true,
        });
        console.log(`[upload] cstoreWritePaymentUsed completed at ${Date.now()}`);
        endCstoreWritePaymentUsed();
      },
    ]);

    const endStatsUpdate = timers.start('statsUpdate'); //TODO add more detailed timers inside
    try {
      const { timings } = await updateStatsAfterUpload({
        ratio1,
        sender: initiatorAddr,
        recipient: recipientKey,
        filesize: effectiveFileSize,
        r1Burn: eventR1Amount,
      });
      timers.timings = { ...timers.timings, ...timings };
      revalidateTag(PLATFORM_STATS_CACHE_TAG, 'default');
    } catch (err) {
      console.error('[upload] Failed to update stats store', err);
    } finally {
      endStatsUpdate();
    }

    const cleanupIndexEntry: FileCleanupIndexEntry = {
      txHash: paymentTxHash,
      cid,
      recipient: recipientKey,
      initiator: initiatorAddr,
      sentAt: sentTimestamp,
    };
    const endCleanupIndexWrite = timers.start('cleanupIndexWrite');
    await ratio1.cstore.hset({
      hkey: FILE_CLEANUP_INDEX_CSTORE_HKEY,
      key: paymentTxHash,
      value: JSON.stringify(cleanupIndexEntry),
    });
    endCleanupIndexWrite();

    return jsonWithServer({
      success: true,
      recordKey: recipientKey,
      record,
      timings: timers.timings,
    });
  } catch (error) {
    if (parsedMultipart && !uploadStarted) {
      await drainFileStream(parsedMultipart.file.stream, parsedMultipart.finished);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[upload] Failed to process upload', error);
    const lower = message.toLowerCase();
    const clientErrors = ['missing', 'mismatch', 'not found', 'exceeds', 'unsupported'];
    const status = clientErrors.some((fragment) => lower.includes(fragment)) ? 400 : 500;
    return jsonWithServer({ success: false, error: message }, { status });
  }
}
