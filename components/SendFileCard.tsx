'use client';

import {
  MANAGER_CONTRACT_ADDRESS,
  MAX_FILE_BYTES,
  R1_CONTRACT_ADDRESS,
  resolveTierBySize,
} from '@/lib/constants';
import { encryptFileForRecipient } from '@/lib/encryption';
import { Erc20Abi, Manager3sendAbi } from '@/lib/SmartContracts';
import { QuoteData } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { formatUnits, isAddress } from 'viem';
import { useAccount, useChainId, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';

const addTenPercentBuffer = (amount: bigint) => {
  if (amount === 0n) return 0n;
  return (amount * 110n + 99n) / 100n; // round up
};

export function SendFileCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tierInfo = useMemo(() => {
    if (!file) return null;
    return resolveTierBySize(file.size);
  }, [file]);

  const sizeExceedsLimit = useMemo(() => {
    if (!file) return false;
    return file.size > MAX_FILE_BYTES;
  }, [file]);

  const {
    data: quoteData,
    isLoading: quoteLoading,
    refetch: refetchQuote,
    error: quoteError,
  } = useQuery<QuoteData>({
    queryKey: ['quote-payment', chainId, MANAGER_CONTRACT_ADDRESS, tierInfo?.id],
    enabled: Boolean(publicClient && MANAGER_CONTRACT_ADDRESS && tierInfo),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!publicClient || !MANAGER_CONTRACT_ADDRESS || !tierInfo) {
        throw new Error('Missing dependencies for payment quote.');
      }
      const [, usdcAmount, r1Amount] = (await publicClient.readContract({
        address: MANAGER_CONTRACT_ADDRESS,
        abi: Manager3sendAbi,
        functionName: 'quotePayment',
        args: [tierInfo.id],
      })) as readonly [number, bigint, bigint];

      const decimalsRaw = await publicClient.readContract({
        address: R1_CONTRACT_ADDRESS,
        abi: Erc20Abi,
        functionName: 'decimals',
        args: [],
      });

      const r1Decimals = typeof decimalsRaw === 'number' ? decimalsRaw : Number(decimalsRaw ?? 18);

      return {
        usdcAmount,
        r1Amount,
        r1Decimals,
        maxR1WithSlippage: addTenPercentBuffer(r1Amount),
      };
    },
  });

  const usdcDisplay = useMemo(() => {
    if (!quoteData) return null;
    const formatted = formatUnits(quoteData.usdcAmount, 6);
    return Number.parseFloat(formatted).toFixed(2);
  }, [quoteData]);

  const r1Display = useMemo(() => {
    if (!quoteData) return null;
    const formatted = formatUnits(quoteData.r1Amount, quoteData.r1Decimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteData]);

  const r1MaxDisplay = useMemo(() => {
    if (!quoteData) return null;
    const formatted = formatUnits(quoteData.maxR1WithSlippage, quoteData.r1Decimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteData]);

  const disabled = useMemo(() => {
    if (!isConnected) return true;
    if (!isAddress(recipient)) return true;
    if (!file) return true;
    if (sending) return true;
    if (!tierInfo) return true;
    if (sizeExceedsLimit) return true;
    if (!chainId) return true;
    if (!MANAGER_CONTRACT_ADDRESS) return true;
    if (quoteLoading) return true;
    if (!quoteData) return true;
    return false;
  }, [
    isConnected,
    recipient,
    file,
    sending,
    tierInfo,
    sizeExceedsLimit,
    chainId,
    MANAGER_CONTRACT_ADDRESS,
    quoteLoading,
    quoteData,
  ]);

  const onSend = useCallback(async () => {
    if (!address || !file) return;
    const selectedFile = file;
    const originalFilename = selectedFile.name;
    const originalMimeType =
      selectedFile.type && selectedFile.type.trim().length > 0
        ? selectedFile.type
        : 'application/octet-stream';
    const originalSize = selectedFile.size;
    setError(null);
    setSending(true);
    setStatus('Preparing payment…');
    try {
      if (!MANAGER_CONTRACT_ADDRESS) {
        throw new Error('Manager contract address is not configured.');
      }
      if (!tierInfo) {
        throw new Error('Selected file exceeds the 5 GB limit we support today.');
      }
      if (!publicClient) {
        throw new Error('Unable to connect to the network client.');
      }
      if (!chainId) {
        throw new Error('Wallet chain not detected.');
      }

      const currentQuote = quoteData ?? (await refetchQuote().then((res) => res.data ?? null));
      if (!currentQuote) {
        throw new Error('Could not fetch payment quote.');
      }

      const maxR1Amount = currentQuote.maxR1WithSlippage;

      setStatus('Resolving recipient key…');
      const receiverKeyResponse = await fetch(
        `/api/send/getReceiverPublicKey?address=${encodeURIComponent(recipient)}`,
        { method: 'GET' }
      );
      const receiverKeyPayload = await receiverKeyResponse.json().catch(() => null);
      if (
        !receiverKeyResponse.ok ||
        !receiverKeyPayload?.success ||
        typeof receiverKeyPayload.publicKey !== 'string'
      ) {
        throw new Error(receiverKeyPayload?.error || 'Failed to resolve receiver public key');
      }
      const receiverPublicKey = receiverKeyPayload.publicKey;

      setStatus('Encrypting file…');
      const { encryptedFile, metadata: encryptionMetadata } = await encryptFileForRecipient({
        file: selectedFile,
        recipientPublicKey: receiverPublicKey,
        recipientAddress: recipient,
      });

      setStatus('Checking R1 allowance…');
      const allowance = await publicClient.readContract({
        address: R1_CONTRACT_ADDRESS,
        abi: Erc20Abi,
        functionName: 'allowance',
        args: [address, MANAGER_CONTRACT_ADDRESS],
      });

      if (allowance < maxR1Amount) {
        setStatus('Approving R1 spend…');
        const approveHash = await writeContractAsync({
          address: R1_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'approve',
          args: [MANAGER_CONTRACT_ADDRESS, maxR1Amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatus('Burning payment…');
      const transferHash = await writeContractAsync({
        address: MANAGER_CONTRACT_ADDRESS,
        abi: Manager3sendAbi,
        functionName: 'transferPayment',
        args: [tierInfo.id, maxR1Amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: transferHash });
      const paymentTxHash = transferHash;

      const startedAt = Date.now();
      setStatus('Signing upload…');
      const handshakeMsg = `ratio1/handshake\nfrom:${address}\nto:${recipient}\ntimestamp:${startedAt}`;
      const signature = await signMessageAsync({ message: handshakeMsg });

      setStatus('Uploading encrypted file…');
      const formData = new FormData();
      formData.append('file', encryptedFile);
      formData.append('initiator', address);
      formData.append('recipient', recipient);
      if (note) formData.append('note', note);
      formData.append('handshakeMessage', handshakeMsg);
      formData.append('signature', signature);
      formData.append('sentAt', String(startedAt));
      formData.append('paymentTxHash', paymentTxHash);
      formData.append('chainId', String(chainId));
      formData.append('tierId', String(tierInfo.id));
      formData.append('originalFilename', originalFilename);
      formData.append('originalMimeType', originalMimeType);
      formData.append('originalSize', String(originalSize));
      formData.append('encryption', JSON.stringify(encryptionMetadata));

      const response = await fetch('/api/send/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Upload failed');
      }

      setFile(null);
      setNote('');
      setStatus(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ratio1:upload-completed'));
      }
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to send';
      setError(message);
      setStatus(null);
    } finally {
      setSending(false);
    }
  }, [
    address,
    chainId,
    file,
    MANAGER_CONTRACT_ADDRESS,
    note,
    publicClient,
    quoteData,
    recipient,
    refetchQuote,
    signMessageAsync,
    tierInfo,
    writeContractAsync,
  ]);

  const buttonLabel = sending ? (status ?? 'Processing…') : 'Pay & Send';

  return (
    <div className="card col" style={{ gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Send a file</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Pay in R1, ETH, or USC. Encrypt and send securely through the Ratio1 Edge Nodes network -
          all with one click. All tokens are converted to R1 and burned.
        </div>
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Recipient wallet address
        </span>
        <input
          className="input"
          placeholder="0x… or ENS (mock)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.trim())}
        />
        {!recipient ? null : isAddress(recipient) ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Address looks valid
          </span>
        ) : (
          <span style={{ color: '#f87171', fontSize: 12 }}>Invalid address format</span>
        )}
      </label>

      <div className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Select file
        </span>
        <div className="dropzone">
          <input
            type="file"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError(null);
            }}
            style={{ width: '100%' }}
          />
          <div className="muted mono" style={{ fontSize: 12, marginTop: 8 }}>
            Max file size 5 GB.
          </div>
          {file && (
            <div style={{ marginTop: 8 }}>
              <div>
                <strong>{file.name}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>
        {sizeExceedsLimit && (
          <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
            Files above 5 GB are not supported yet.
          </div>
        )}
        {tierInfo && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{tierInfo.label}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {tierInfo.description}
            </div>
            {quoteLoading && (
              <div className="muted" style={{ fontSize: 12 }}>
                Fetching payment quote…
              </div>
            )}
            {quoteError && (
              <div style={{ color: '#f87171', fontSize: 12 }}>
                {(quoteError as Error).message || 'Failed to fetch payment quote.'}
              </div>
            )}
            {!quoteLoading && quoteData && (
              <div className="muted mono" style={{ fontSize: 12, marginTop: 4 }}>
                Quote: {usdcDisplay ?? '—'} USDC → {r1Display ?? '—'} R1
                {' · '}
                Max burn (incl. 10% buffer): {r1MaxDisplay ?? '—'} R1
              </div>
            )}
          </div>
        )}
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Optional note
        </span>
        <input
          className="input"
          placeholder="Say hi to the recipient (encrypted)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {!isConnected && (
        <div className="muted" style={{ fontSize: 12 }}>
          Connect your wallet to continue.
        </div>
      )}
      {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="button" onClick={onSend} disabled={disabled}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
