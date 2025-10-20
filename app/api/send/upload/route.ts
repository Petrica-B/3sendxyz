import {
  RECEIVED_FILES_CSTORE_HKEY,
  SENT_FILES_CSTORE_HKEY,
  resolveTierBySize,
} from '@/lib/constants';
import { Manager3sendAbi } from '@/lib/SmartContracts';
import type { StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { createPublicClient, decodeEventLog, http } from 'viem';
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
    const sentAtRaw = formData.get('sentAt');
    const paymentTx = formData.get('paymentTxHash');
    const chainIdRaw = formData.get('chainId');
    const tierIdRaw = formData.get('tierId');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }

    if (typeof recipient !== 'string' || recipient.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing recipient' }, { status: 400 });
    }

    if (typeof initiator !== 'string' || initiator.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing initiator' }, { status: 400 });
    }

    if (typeof paymentTx !== 'string' || !paymentTx.startsWith('0x')) {
      return NextResponse.json({ success: false, error: 'Missing paymentTxHash' }, { status: 400 });
    }

    const chainId = typeof chainIdRaw === 'string' ? Number(chainIdRaw) : Number(chainIdRaw ?? NaN);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json({ success: false, error: 'Missing chainId' }, { status: 400 });
    }

    const expectedTier = resolveTierBySize(file.size);
    if (!expectedTier) {
      return NextResponse.json(
        { success: false, error: 'File exceeds maximum allowed size' },
        { status: 400 }
      );
    }

    if (typeof tierIdRaw === 'string' && Number(tierIdRaw) !== expectedTier.id) {
      return NextResponse.json({ success: false, error: 'Tier mismatch' }, { status: 400 });
    }

    const rpcDetails = getRpcUrl(chainId);
    if (!rpcDetails) {
      return NextResponse.json({ success: false, error: 'Unsupported chain' }, { status: 400 });
    }

    const { chain, rpcUrl } = rpcDetails;
    const client = createPublicClient({ chain, transport: http(rpcUrl) });

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: paymentTx as `0x${string}` });
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

    const recipientKey = recipient.toLowerCase();
    const initiatorAddr = initiator.toLowerCase();
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

    const sentAt = typeof sentAtRaw === 'string' ? Number(sentAtRaw) : Date.now();
    const sentTimestamp = Number.isFinite(sentAt) ? sentAt : Date.now();
    const noteValue = typeof note === 'string' && note.trim().length > 0 ? note : undefined;

    const ratio1 = createEdgeSdk();
    const fileBase64 = await file.arrayBuffer();
    const file_base64_str = Buffer.from(fileBase64).toString('base64');
    const uploadResult = await ratio1.r1fs.addFileBase64({
      file_base64_str,
      filename: file.name,
      secret: recipientKey,
    });
    const cid =
      uploadResult && typeof uploadResult === 'object' && 'cid' in uploadResult
        ? (uploadResult as { cid: string }).cid
        : undefined;
    if (!cid) {
      throw new Error('Failed to store file in R1FS');
    }

    const record: StoredUploadRecord = {
      cid,
      filename: file.name,
      recipient: recipientKey,
      initiator: initiatorAddr,
      note: noteValue,
      txHash: paymentTx,
      filesize: file.size,
      sentAt: sentTimestamp,
      tierId: expectedTier.id,
      usdcAmount: eventUsdcAmount.toString(),
      r1Amount: eventR1Amount.toString(),
    };

    await ratio1.cstore.hset({
      hkey: `${RECEIVED_FILES_CSTORE_HKEY}_${recipientKey}`,
      key: paymentTx,
      value: JSON.stringify(record),
    });
    await ratio1.cstore.hset({
      hkey: `${SENT_FILES_CSTORE_HKEY}_${initiatorAddr}`,
      key: paymentTx,
      value: JSON.stringify(record),
    });

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
