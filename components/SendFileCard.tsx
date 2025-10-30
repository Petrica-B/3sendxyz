'use client';

import {
  MANAGER_CONTRACT_ADDRESS,
  MAX_FILE_BYTES,
  R1_CONTRACT_ADDRESS,
  USDC_CONTRACT_ADDRESS,
  WETH_CONTRACT_ADDRESS,
  resolveTierBySize,
} from '@/lib/constants';
import { encryptFileForRecipient } from '@/lib/encryption';
import { Erc20Abi, Manager3sendAbi } from '@/lib/SmartContracts';
import { QuoteData } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, isAddress } from 'viem';
import { useAccount, useChainId, usePublicClient, useSignMessage, useWriteContract } from 'wagmi';

const addTenPercentBuffer = (amount: bigint) => {
  if (amount === 0n) return 0n;
  return (amount * 110n + 99n) / 100n; // round up
};

const subtractTenPercentBuffer = (amount: bigint) => {
  if (amount === 0n) return 0n;
  const reduced = (amount * 90n) / 100n;
  return reduced > 0n ? reduced : 1n;
};

const USDC_DECIMALS = 6;

type PaymentAsset = 'R1' | 'USDC' | 'ETH';

const PAYMENT_OPTIONS: ReadonlyArray<{ id: PaymentAsset; label: string; helper: string }> = [
  {
    id: 'R1',
    label: 'Pay with R1',
    helper: 'Burn R1 directly from your wallet.',
  },
  {
    id: 'USDC',
    label: 'Pay with USDC',
    helper: "We'll swap USDC to R1 and burn it for you.",
  },
  {
    id: 'ETH',
    label: 'Pay with ETH',
    helper: 'We route ETH → USDC → R1 in one transaction.',
  },
];

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
  const [paymentAsset, setPaymentAsset] = useState<PaymentAsset>('R1');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const waitForTransaction = useCallback(
    async (hash: `0x${string}`, pendingLabel: string) => {
      if (!publicClient) {
        throw new Error('Unable to connect to the network client.');
      }
      setStatus(pendingLabel);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
      });
      if (receipt.status !== 'success') {
        throw new Error('Transaction failed on-chain.');
      }
      return receipt;
    },
    [publicClient],
  );

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

      const quote: QuoteData = {
        usdcAmount,
        r1Amount,
        r1Decimals,
        maxR1WithSlippage: addTenPercentBuffer(r1Amount),
        minR1WithSlippage: subtractTenPercentBuffer(r1Amount),
      };

      try {
        const wethDecimalsRaw = await publicClient.readContract({
          address: WETH_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'decimals',
          args: [],
        });

        const wethDecimals =
          typeof wethDecimalsRaw === 'number' ? wethDecimalsRaw : Number(wethDecimalsRaw ?? 18);

        const path = [WETH_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS] as const;

        const [, wethAmount, usdcEquivalent] = (await publicClient.readContract({
          address: MANAGER_CONTRACT_ADDRESS,
          abi: Manager3sendAbi,
          functionName: 'quotePaymentWithToken',
          args: [tierInfo.id, WETH_CONTRACT_ADDRESS, path],
        })) as readonly [bigint, bigint, bigint];

        quote.wethAddress = WETH_CONTRACT_ADDRESS;
        quote.wethAmount = wethAmount;
        quote.wethDecimals = wethDecimals;
        quote.maxWethWithSlippage = addTenPercentBuffer(wethAmount);

        if (usdcEquivalent !== usdcAmount && process.env.NODE_ENV !== 'production') {
          console.warn('USDC quote mismatch between base and ETH path', {
            expected: usdcAmount,
            fromEth: usdcEquivalent,
          });
        }
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Failed to quote payment with ETH', err);
        }
      }

      return quote;
    },
  });

  const {
    data: walletBalances,
    isFetching: balancesLoading,
    refetch: refetchWalletBalances,
  } = useQuery({
    queryKey: ['wallet-balances', chainId, MANAGER_CONTRACT_ADDRESS, address],
    enabled: Boolean(publicClient && address && MANAGER_CONTRACT_ADDRESS),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    queryFn: async () => {
      if (!publicClient || !address) {
        throw new Error('Missing dependencies for wallet balances.');
      }

      const [r1Balance, usdcBalance, ethBalance] = await Promise.all([
        publicClient.readContract({
          address: R1_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        publicClient.getBalance({ address }),
      ]);

      return {
        r1Balance,
        usdcBalance,
        ethBalance,
      };
    },
  });

  useEffect(() => {
    if (
      paymentAsset === 'ETH' &&
      quoteData &&
      (quoteData.wethAmount == null || quoteData.maxWethWithSlippage == null)
    ) {
      setPaymentAsset('R1');
    }
  }, [paymentAsset, quoteData]);

  const usdcDisplay = useMemo(() => {
    if (!quoteData) return null;
    const formatted = formatUnits(quoteData.usdcAmount, USDC_DECIMALS);
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

  const r1MinDisplay = useMemo(() => {
    if (!quoteData) return null;
    const formatted = formatUnits(quoteData.minR1WithSlippage, quoteData.r1Decimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteData]);

  const ethDisplay = useMemo(() => {
    if (!quoteData?.wethAmount || quoteData.wethDecimals == null) return null;
    const formatted = formatUnits(quoteData.wethAmount, quoteData.wethDecimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteData]);

  const ethMaxDisplay = useMemo(() => {
    if (!quoteData?.maxWethWithSlippage || quoteData.wethDecimals == null) return null;
    const formatted = formatUnits(quoteData.maxWethWithSlippage, quoteData.wethDecimals);
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
    if (balancesLoading) return true;
    if (!walletBalances) return true;

    if (paymentAsset === 'R1') {
      if (walletBalances.r1Balance < quoteData.maxR1WithSlippage) return true;
    } else if (paymentAsset === 'USDC') {
      if (walletBalances.usdcBalance < quoteData.usdcAmount) return true;
    } else if (
      paymentAsset === 'ETH' &&
      (!quoteData.maxWethWithSlippage || walletBalances.ethBalance < quoteData.maxWethWithSlippage)
    ) {
      return true;
    }

    return false;
  }, [
    isConnected,
    recipient,
    file,
    sending,
    tierInfo,
    sizeExceedsLimit,
    chainId,
    quoteLoading,
    quoteData,
    balancesLoading,
    walletBalances,
    paymentAsset,
  ]);

  const insufficientMessage = useMemo(() => {
    if (!quoteData || !walletBalances) return null;

    if (paymentAsset === 'R1' && walletBalances.r1Balance < quoteData.maxR1WithSlippage) {
      const needed = Number.parseFloat(
        formatUnits(quoteData.maxR1WithSlippage, quoteData.r1Decimals)
      ).toFixed(6);
      const available = Number.parseFloat(
        formatUnits(walletBalances.r1Balance, quoteData.r1Decimals)
      ).toFixed(6);
      return `You need ${needed} R1 (incl. buffer) but only have ${available} R1.`;
    }

    if (paymentAsset === 'USDC' && walletBalances.usdcBalance < quoteData.usdcAmount) {
      const needed = Number.parseFloat(formatUnits(quoteData.usdcAmount, USDC_DECIMALS)).toFixed(2);
      const available = Number.parseFloat(
        formatUnits(walletBalances.usdcBalance, USDC_DECIMALS)
      ).toFixed(2);
      return `You need ${needed} USDC but only have ${available} USDC.`;
    }

    if (
      paymentAsset === 'ETH' &&
      quoteData.maxWethWithSlippage &&
      walletBalances.ethBalance < quoteData.maxWethWithSlippage &&
      quoteData.wethDecimals != null
    ) {
      const needed = Number.parseFloat(
        formatUnits(quoteData.maxWethWithSlippage, quoteData.wethDecimals)
      ).toFixed(6);
      const available = Number.parseFloat(
        formatUnits(walletBalances.ethBalance, quoteData.wethDecimals)
      ).toFixed(6);
      return `You need about ${needed} ETH (incl. buffer) but only have ${available} ETH.`;
    }

    return null;
  }, [paymentAsset, quoteData, walletBalances]);

  const summaryItems = useMemo(() => {
    if (!quoteData) return [];
    const items: Array<{ label: string; value: string; helper?: string }> = [
      {
        label: 'USD equivalent',
        value: usdcDisplay ? `${usdcDisplay} $` : '—',
      },
      {
        label: 'R1 burned',
        value: r1Display ? `${r1Display} R1` : '—',
        helper: r1MinDisplay
          ? `We guard for at least ${r1MinDisplay} R1 after slippage.`
          : undefined,
      },
    ];

    if (paymentAsset === 'R1') {
      items.push({
        label: 'You spend',
        value: r1MaxDisplay ? `${r1MaxDisplay} R1 max` : '—',
        helper: 'Includes a 10% buffer to absorb price swings.',
      });
    } else if (paymentAsset === 'USDC') {
      items.push({
        label: 'You spend',
        value: usdcDisplay ? `${usdcDisplay} USDC` : '—',
        helper: 'Charged in USDC exactly, automated swap happens on-chain.',
      });
    } else if (paymentAsset === 'ETH') {
      items.push({
        label: 'You send',
        value: ethDisplay ? `${ethDisplay} ETH` : '—',
        helper: ethMaxDisplay
          ? `We request up to ${ethMaxDisplay} ETH to stay ahead of volatility.`
          : undefined,
      });
    }

    return items;
  }, [
    paymentAsset,
    quoteData,
    usdcDisplay,
    r1Display,
    r1MinDisplay,
    r1MaxDisplay,
    ethDisplay,
    ethMaxDisplay,
  ]);

  const activeBalanceDisplay = useMemo(() => {
    if (!walletBalances) return null;
    if (paymentAsset === 'R1') {
      return `${Number.parseFloat(
        formatUnits(walletBalances.r1Balance, quoteData?.r1Decimals ?? 18)
      ).toFixed(6)} R1`;
    }
    if (paymentAsset === 'USDC') {
      return `${Number.parseFloat(formatUnits(walletBalances.usdcBalance, USDC_DECIMALS)).toFixed(
        2
      )} USDC`;
    }
    const decimals = quoteData?.wethDecimals ?? 18;
    return `${Number.parseFloat(formatUnits(walletBalances.ethBalance, decimals)).toFixed(6)} ETH`;
  }, [walletBalances, paymentAsset, quoteData]);

  const paymentAmountByAsset = useMemo<Record<PaymentAsset, string | null>>(() => {
    const map: Record<PaymentAsset, string | null> = {
      R1: null,
      USDC: null,
      ETH: null,
    };
    if (!quoteData) return map;

    map.R1 = r1MaxDisplay ? `${r1MaxDisplay} R1 max` : r1Display ? `${r1Display} R1` : null;
    map.USDC = usdcDisplay ? `${usdcDisplay} USDC` : null;

    if (quoteData.maxWethWithSlippage && quoteData.wethDecimals != null) {
      map.ETH = ethMaxDisplay
        ? `${ethMaxDisplay} ETH max`
        : ethDisplay
          ? `${ethDisplay} ETH`
          : null;
    } else if (ethDisplay) {
      map.ETH = `${ethDisplay} ETH`;
    }

    return map;
  }, [ethDisplay, ethMaxDisplay, quoteData, r1Display, r1MaxDisplay, usdcDisplay]);

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
      const minR1Amount = currentQuote.minR1WithSlippage;
      const usdcAmount = currentQuote.usdcAmount;

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
      const receiverKeySource =
        receiverKeyPayload.type === 'passkey'
          ? 'passkey'
          : receiverKeyPayload.type === 'seed'
            ? 'seed'
            : 'vault';

      setStatus('Encrypting file…');
      const hasNote = typeof note === 'string' && note.trim().length > 0;
      const { encryptedFile, metadata: encryptionMetadata } = await encryptFileForRecipient({
        file: selectedFile,
        recipientPublicKey: receiverPublicKey,
        recipientAddress: recipient,
        note: hasNote ? note : undefined,
      });
      encryptionMetadata.keySource = receiverKeySource;

      let paymentTxHash: `0x${string}` | undefined;

      if (paymentAsset === 'R1') {
        setStatus('Checking R1 balance…');
        const r1Balance = (await publicClient.readContract({
          address: R1_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (r1Balance < maxR1Amount) {
          throw new Error('Not enough R1 to cover the burn and buffer.');
        }

        setStatus('Checking R1 allowance…');
        const allowance = (await publicClient.readContract({
          address: R1_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'allowance',
          args: [address, MANAGER_CONTRACT_ADDRESS],
        })) as bigint;

        if (allowance < maxR1Amount) {
          setStatus('Approving R1 spend…');
          const approveHash = await writeContractAsync({
            address: R1_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'approve',
            args: [MANAGER_CONTRACT_ADDRESS, maxR1Amount],
          });
          await waitForTransaction(approveHash, 'Confirming R1 approval on-chain…');
        }

        setStatus('Paying with R1…');
        const transferHash = await writeContractAsync({
          address: MANAGER_CONTRACT_ADDRESS,
          abi: Manager3sendAbi,
          functionName: 'transferPayment',
          args: [tierInfo.id, maxR1Amount],
        });
        await waitForTransaction(transferHash, 'Waiting for R1 burn confirmation…');
        paymentTxHash = transferHash;
      } else if (paymentAsset === 'USDC') {
        setStatus('Checking USDC balance…');
        const usdcBalance = (await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (usdcBalance < usdcAmount) {
          throw new Error('Not enough USDC to cover the payment.');
        }

        setStatus('Checking USDC allowance…');
        const usdcAllowance = (await publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'allowance',
          args: [address, MANAGER_CONTRACT_ADDRESS],
        })) as bigint;

        if (usdcAllowance < usdcAmount) {
          setStatus('Approving USDC spend…');
          const approveHash = await writeContractAsync({
            address: USDC_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'approve',
            args: [MANAGER_CONTRACT_ADDRESS, usdcAmount],
          });
          await waitForTransaction(approveHash, 'Confirming USDC approval on-chain…');
        }

        setStatus('Paying with USDC…');
        const transferHash = await writeContractAsync({
          address: MANAGER_CONTRACT_ADDRESS,
          abi: Manager3sendAbi,
          functionName: 'transferPaymentWithUSDC',
          args: [tierInfo.id, minR1Amount],
        });
        await waitForTransaction(transferHash, 'Waiting for USDC swap confirmation…');
        paymentTxHash = transferHash;
      } else {
        if (
          !currentQuote.wethAmount ||
          !currentQuote.maxWethWithSlippage ||
          currentQuote.wethDecimals == null
        ) {
          throw new Error('Unable to quote ETH payment right now.');
        }

        setStatus('Checking ETH balance…');
        const ethBalance = await publicClient.getBalance({ address });
        if (ethBalance < currentQuote.maxWethWithSlippage) {
          throw new Error('Not enough ETH to cover the swap and buffer.');
        }

        setStatus('Paying with ETH…');
        const transferHash = await writeContractAsync({
          address: MANAGER_CONTRACT_ADDRESS,
          abi: Manager3sendAbi,
          functionName: 'transferPaymentWithETH',
          args: [tierInfo.id, minR1Amount],
          value: currentQuote.maxWethWithSlippage,
        });
        await waitForTransaction(transferHash, 'Waiting for ETH swap confirmation…');
        paymentTxHash = transferHash;
      }

      if (!paymentTxHash) {
        throw new Error('Payment was not confirmed.');
      }

      const startedAt = Date.now();
      setStatus('Signing upload…');
      const handshakeMsg = `ratio1/handshake\nfrom:${address}\nto:${recipient}\ntimestamp:${startedAt}`;
      const signature = await signMessageAsync({ message: handshakeMsg });

      setStatus('Uploading encrypted file…');
      const formData = new FormData();
      formData.append('file', encryptedFile);
      formData.append('initiator', address);
      formData.append('recipient', recipient);
      formData.append('handshakeMessage', handshakeMsg);
      formData.append('signature', signature);
      formData.append('sentAt', String(startedAt));
      formData.append('paymentTxHash', paymentTxHash);
      formData.append('chainId', String(chainId));
      formData.append('tierId', String(tierInfo.id));
      formData.append('paymentAsset', paymentAsset);
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
      setRecipient('');
      setNote('');
      setStatus(null);
      await refetchQuote();
      await refetchWalletBalances();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ratio1:upload-completed'));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
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
    note,
    publicClient,
    quoteData,
    recipient,
    refetchQuote,
    refetchWalletBalances,
    signMessageAsync,
    tierInfo,
    paymentAsset,
    waitForTransaction,
    writeContractAsync,
  ]);

  const buttonLabel = sending ? (status ?? 'Processing…') : `Send with ${paymentAsset}`;

  return (
    <div className="card col" style={{ gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Send a file</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Pay in R1, ETH, or USDC. Encrypt and send securely through the Ratio1 Edge Nodes network -
          all with one click. All tokens are converted to R1 and burned.
        </div>
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Recipient wallet address
        </span>
        <input
          className="input"
          placeholder="0x…"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.trim())}
          autoComplete="off"
          data-1p-ignore
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
            ref={fileInputRef}
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
          <div className="col" style={{ marginTop: 8, gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{tierInfo.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {tierInfo.description}
              </div>
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
            {!quoteLoading && !quoteError && quoteData && (
              <div className="col" style={{ gap: 12 }}>
                <div className="col" style={{ gap: 8 }}>
                  <span className="muted mono" style={{ fontSize: 12, color: '#334155' }}>
                    Payment asset
                  </span>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {PAYMENT_OPTIONS.map((option) => {
                      const isActive = paymentAsset === option.id;
                      const isDisabled =
                        option.id === 'ETH' &&
                        (!quoteData.wethAmount || !quoteData.maxWethWithSlippage);
                      const amountCopy =
                        paymentAmountByAsset[option.id] ??
                        (quoteLoading ? 'Fetching…' : 'Quote unavailable');
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setPaymentAsset(option.id);
                            setError(null);
                          }}
                          style={{
                            flex: '1 0 120px',
                            minWidth: 0,
                            padding: '12px 16px',
                            textAlign: 'left' as const,
                            borderRadius: 12,
                            border: isActive
                              ? '1px solid rgba(15, 23, 42, 0.4)'
                              : '1px solid rgba(148, 163, 184, 0.45)',
                            background: isActive ? '#f1f5f9' : '#ffffff',
                            color: '#0f172a',
                            opacity: isDisabled ? 0.5 : 1,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            transition: 'background 0.2s ease, border 0.2s ease, color 0.2s ease',
                            boxShadow: isActive
                              ? '0 8px 20px rgba(15, 23, 42, 0.08)'
                              : '0 4px 14px rgba(15, 23, 42, 0.05)',
                          }}
                        >
                          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{option.label}</span>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {amountCopy ?? '—'}
                            </span>
                          </div>
                          <span className="muted" style={{ fontSize: 11, color: '#475569' }}>
                            {option.helper}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="col"
                  style={{
                    gap: 8,
                    padding: 12,
                    borderRadius: 12,
                    background: '#ffffff',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <span
                    className="muted mono"
                    style={{ fontSize: 14, letterSpacing: 0.6, color: '#334155' }}
                  >
                    Payment summary
                  </span>
                  {summaryItems.map((item) => (
                    <div key={item.label} className="col" style={{ gap: 2 }}>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                        <span className="muted" style={{ fontSize: 12, color: '#475569' }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                          {item.value}
                        </span>
                      </div>
                      {item.helper && (
                        <span className="muted" style={{ fontSize: 11, color: '#64748b' }}>
                          {item.helper}
                        </span>
                      )}
                    </div>
                  ))}
                  {activeBalanceDisplay && (
                    <div
                      className="row"
                      style={{
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 12,
                        color: '#334155',
                      }}
                    >
                      <span className="muted" style={{ color: '#475569' }}>
                        Wallet balance
                      </span>
                      <span style={{ fontWeight: 600 }}>{activeBalanceDisplay}</span>
                    </div>
                  )}
                  {insufficientMessage && (
                    <div style={{ color: '#dc2626', fontSize: 12 }}>{insufficientMessage}</div>
                  )}
                </div>
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
          autoComplete="off"
          data-1p-ignore
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
