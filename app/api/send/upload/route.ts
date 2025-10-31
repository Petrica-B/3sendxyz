import {
  RECEIVED_FILES_CSTORE_HKEY,
  SENT_FILES_CSTORE_HKEY,
  resolveTierBySize,
} from '@/lib/constants';
import {
  buildSendHandshakeMessage,
  computeEncryptionMetadataDigest,
  parseSendHandshakeMessage,
} from '@/lib/handshake';
import { Manager3sendAbi } from '@/lib/SmartContracts';
import { PLATFORM_STATS_CACHE_TAG, updateStatsAfterUpload } from '@/lib/stats';
import type { EncryptionMetadata, StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { createPublicClient, decodeEventLog, http, isAddress, verifyMessage } from 'viem';
import { base, baseSepolia, type Chain } from 'viem/chains';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const recipient = formData.get('recipient');
    const initiator = formData.get('initiator');
    const note = formData.get('note');
    const handshakeMessageRaw = formData.get('handshakeMessage');
    const signatureRaw = formData.get('signature');
    const sentAtRaw = formData.get('sentAt');
    const paymentTxHashRaw = formData.get('paymentTxHash');
    const chainIdRaw = formData.get('chainId');
    const tierIdRaw = formData.get('tierId');
    const originalSizeRaw = formData.get('originalSize');
    const originalFilenameRaw = formData.get('originalFilename');
    const originalMimeTypeRaw = formData.get('originalMimeType');
    const encryptionRaw = formData.get('encryption');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }

    if (typeof recipient !== 'string' || recipient.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing recipient' }, { status: 400 });
    }

    const recipientAddress = recipient.trim();
    if (!isAddress(recipientAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid recipient address' }, { status: 400 });
    }

    if (typeof initiator !== 'string' || initiator.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing initiator' }, { status: 400 });
    }

    const initiatorAddress = initiator.trim();
    if (!isAddress(initiatorAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid initiator address' }, { status: 400 });
    }

    if (typeof handshakeMessageRaw !== 'string' || handshakeMessageRaw.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing handshakeMessage' },
        { status: 400 }
      );
    }

    if (typeof signatureRaw !== 'string' || signatureRaw.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing signature' }, { status: 400 });
    }

    if (!signatureRaw.trim().startsWith('0x')) {
      return NextResponse.json(
        { success: false, error: 'Invalid signature format' },
        { status: 400 }
      );
    }

    if (typeof paymentTxHashRaw !== 'string' || !paymentTxHashRaw.startsWith('0x')) {
      return NextResponse.json({ success: false, error: 'Missing paymentTxHash' }, { status: 400 });
    }

    const handshakeMessage = handshakeMessageRaw.replace(/\r\n/g, '\n').trim();
    if (handshakeMessage.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing handshakeMessage' },
        { status: 400 }
      );
    }
    const signature = signatureRaw.trim() as `0x${string}`;
    const paymentTxHash = paymentTxHashRaw.toLowerCase() as `0x${string}`;

    const chainId = typeof chainIdRaw === 'string' ? Number(chainIdRaw) : Number(chainIdRaw ?? NaN);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json({ success: false, error: 'Missing chainId' }, { status: 400 });
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

    const effectiveFileSize = parsedOriginalSize ?? file.size;

    const expectedTier = resolveTierBySize(effectiveFileSize);
    if (!expectedTier) {
      return NextResponse.json(
        { success: false, error: 'File exceeds maximum allowed size' },
        { status: 400 }
      );
    }

    if (typeof tierIdRaw === 'string' && Number(tierIdRaw) !== expectedTier.id) {
      return NextResponse.json({ success: false, error: 'Tier mismatch' }, { status: 400 });
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
        return NextResponse.json(
          { success: false, error: 'Invalid encryption metadata' },
          { status: 400 }
        );
      }
    }

    if (!encryptionMetadata) {
      return NextResponse.json(
        { success: false, error: 'Missing encryption metadata' },
        { status: 400 }
      );
    }

    if (
      Number.isFinite(encryptionMetadata.plaintextLength) &&
      (encryptionMetadata.plaintextLength as number) > 0 &&
      Math.floor(encryptionMetadata.plaintextLength as number) !== effectiveFileSize
    ) {
      return NextResponse.json(
        { success: false, error: 'Plaintext size mismatch' },
        { status: 400 }
      );
    }

    if (
      Number.isFinite(encryptionMetadata.ciphertextLength) &&
      (encryptionMetadata.ciphertextLength as number) > 0 &&
      Math.floor(encryptionMetadata.ciphertextLength as number) !== file.size
    ) {
      return NextResponse.json(
        { success: false, error: 'Ciphertext size mismatch' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { success: false, error: `Invalid handshake message: ${detail}` },
        { status: 400 }
      );
    }

    if (parsedHandshake.sender !== initiatorAddr) {
      return NextResponse.json(
        { success: false, error: 'Handshake sender mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.recipient !== recipientKey) {
      return NextResponse.json(
        { success: false, error: 'Handshake recipient mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.chainId !== chainId) {
      return NextResponse.json(
        { success: false, error: 'Handshake chain mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.paymentTxHash !== paymentTxHash) {
      return NextResponse.json(
        { success: false, error: 'Handshake payment hash mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.tierId !== expectedTier.id) {
      return NextResponse.json(
        { success: false, error: 'Handshake tier mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.plaintextBytes !== effectiveFileSize) {
      return NextResponse.json(
        { success: false, error: 'Handshake plaintext size mismatch' },
        { status: 400 }
      );
    }
    if (parsedHandshake.ciphertextBytes !== file.size) {
      return NextResponse.json(
        { success: false, error: 'Handshake ciphertext size mismatch' },
        { status: 400 }
      );
    }

    const expectedMetadataDigest = computeEncryptionMetadataDigest(encryptionMetadata);
    if (parsedHandshake.metadataDigest !== expectedMetadataDigest) {
      return NextResponse.json(
        { success: false, error: 'Handshake metadata mismatch' },
        { status: 400 }
      );
    }

    if (parsedHandshake.sentAtMs !== sentTimestampCandidate) {
      return NextResponse.json(
        { success: false, error: 'Handshake timestamp mismatch' },
        { status: 400 }
      );
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
      ciphertextBytes: file.size,
      originalFilename: originalFilename ?? file.name,
      encryption: encryptionMetadata,
    });

    if (expectedHandshakeMessage !== handshakeMessage) {
      return NextResponse.json(
        { success: false, error: 'Handshake message mismatch' },
        { status: 400 }
      );
    }

    const signatureVerified = await verifyMessage({
      address: initiatorAddress as `0x${string}`,
      message: handshakeMessage,
      signature,
    });
    if (!signatureVerified) {
      return NextResponse.json(
        { success: false, error: 'Handshake signature mismatch' },
        { status: 400 }
      );
    }

    const rpcDetails = getRpcUrl(chainId);
    if (!rpcDetails) {
      return NextResponse.json({ success: false, error: 'Unsupported chain' }, { status: 400 });
    }

    const { chain, rpcUrl } = rpcDetails;
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: paymentTxHash });
    } catch {
      throw new Error('Payment transaction not found or not yet indexed');
    }
    console.log('Transaction receipt:', receipt);

    if (!receipt || receipt.status !== 'success') {
      throw new Error('Payment transaction not confirmed');
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

    const eventUsdcAmount = (paymentLog.args.usdcAmount ?? 0n) as bigint;
    const eventR1Amount = (paymentLog.args.r1Amount ?? 0n) as bigint;

    const ratio1 = createEdgeSdk();
    const fileBase64 = await file.arrayBuffer();
    const file_base64_str = Buffer.from(fileBase64).toString('base64');
    const uploadResult = await ratio1.r1fs.addFileBase64({
      file_base64_str,
      filename: file.name,
      secret: recipientKey,
    });
    const cid = uploadResult.cid;
    if (!cid) {
      throw new Error('Failed to store file in R1FS');
    }

    const hasEncryptedNote =
      typeof encryptionMetadata.noteCiphertext === 'string' &&
      encryptionMetadata.noteCiphertext.trim().length > 0 &&
      typeof encryptionMetadata.noteIv === 'string' &&
      encryptionMetadata.noteIv.trim().length > 0;

    const noteValue = typeof note === 'string' && note.trim().length > 0 ? note : undefined;

    const record: StoredUploadRecord = {
      cid,
      filename: originalFilename ?? file.name,
      recipient: recipientKey,
      initiator: initiatorAddr,
      note: hasEncryptedNote ? undefined : noteValue,
      txHash: paymentTxHash,
      filesize: effectiveFileSize,
      sentAt: sentTimestamp,
      tierId: expectedTier.id,
      usdcAmount: eventUsdcAmount.toString(),
      r1Amount: eventR1Amount.toString(),
      originalFilename: originalFilename ?? file.name,
      originalMimeType,
      originalFilesize: parsedOriginalSize ?? undefined,
      encryptedFilesize: file.size,
      encryption: encryptionMetadata,
    };

    await ratio1.cstore.hset({
      hkey: `${RECEIVED_FILES_CSTORE_HKEY}_${recipientKey}`,
      key: paymentTxHash,
      value: JSON.stringify(record),
    });
    await ratio1.cstore.hset({
      hkey: `${SENT_FILES_CSTORE_HKEY}_${initiatorAddr}`,
      key: paymentTxHash,
      value: JSON.stringify(record),
    });

    try {
      await updateStatsAfterUpload({
        ratio1,
        sender: initiatorAddr,
        recipient: recipientKey,
        filesize: effectiveFileSize,
        r1Burn: eventR1Amount,
      });
      revalidateTag(PLATFORM_STATS_CACHE_TAG);
    } catch (err) {
      console.error('[upload] Failed to update stats store', err);
    }

    return NextResponse.json({
      success: true,
      recordKey: recipientKey,
      record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[upload] Failed to process upload', error);
    const lower = message.toLowerCase();
    const clientErrors = ['missing', 'mismatch', 'not found', 'exceeds', 'unsupported'];
    const status = clientErrors.some((fragment) => lower.includes(fragment)) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
