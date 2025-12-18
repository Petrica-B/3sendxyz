'use client';

import { Erc20Abi, Manager3sendAbi } from '@/lib/SmartContracts';
import { shortAddress } from '@/lib/format';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { parseIdentityKey } from '@/lib/identityKey';
import {
  FREE_MICRO_SENDS_PER_MONTH,
  FREE_MICRO_TIER_ID,
  FREE_PAYMENT_REFERENCE_PREFIX,
  isSupportedChainId,
  MANAGER_CONTRACT_ADDRESS,
  MAX_FILE_BYTES,
  R1_CONTRACT_ADDRESS,
  REQUIRED_CHAIN_NAME,
  resolveTierBySize,
  USDC_CONTRACT_ADDRESS,
  WETH_CONTRACT_ADDRESS,
} from '@/lib/constants';
import { encryptFileForRecipient } from '@/lib/encryption';
import { buildSendHandshakeMessage } from '@/lib/handshake';
import { FreeSendAllowance, QuoteData } from '@/lib/types';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { getAddress as resolveAddressFromName } from '@coinbase/onchainkit/identity';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { formatUnits } from 'viem';
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
  const { authMethod, identityValue } = useAuthStatus();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const isWalletLogin = authMethod === 'wallet';
  const isEmailLogin = authMethod === 'clerk';
  const hasIdentity = Boolean(identityValue);
  const walletAddress = isWalletLogin ? address : undefined;
  const isOnSupportedChain = isWalletLogin ? isSupportedChainId(chainId) : true;
  const wrongNetwork = isWalletLogin && isConnected && !isOnSupportedChain;

  const [recipientInput, setRecipientInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [paymentAsset, setPaymentAsset] = useState<PaymentAsset>('R1');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedRecipientInput = useMemo(() => recipientInput.trim(), [recipientInput]);

  const parsedRecipientInput = useMemo(() => {
    if (!normalizedRecipientInput) return null;
    return parseIdentityKey(normalizedRecipientInput);
  }, [normalizedRecipientInput]);

  const {
    data: resolvedRecipientAddress,
    isFetching: recipientResolutionLoading,
    error: recipientResolutionError,
  } = useQuery<string | null>({
    queryKey: ['recipient-address', normalizedRecipientInput],
    enabled: Boolean(normalizedRecipientInput && !parsedRecipientInput),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const resolved = await resolveAddressFromName({ name: normalizedRecipientInput });
      if (!resolved) {
        throw new Error('Unable to resolve this name to an address.');
      }
      return resolved.toLowerCase();
    },
  });

  const resolvedRecipientIdentity = useMemo(() => {
    if (!resolvedRecipientAddress) return null;
    return parseIdentityKey(resolvedRecipientAddress);
  }, [resolvedRecipientAddress]);
  const recipientIdentity = parsedRecipientInput ?? resolvedRecipientIdentity;
  const recipientResolvedFromName = Boolean(!parsedRecipientInput && resolvedRecipientAddress);
  const recipientValue = recipientIdentity?.value ?? null;
  const recipientWalletAddress = recipientIdentity?.kind === 'wallet' ? recipientIdentity.value : null;
  const recipientEmail = recipientIdentity?.kind === 'email' ? recipientIdentity.value : null;
  const normalizedRecipientAddress = recipientWalletAddress?.trim().toLowerCase() ?? '';
  const shortRecipientAddress = recipientWalletAddress ? shortAddress(recipientWalletAddress, 4) : '';

  const { data: recipientIdentityProfile } = useQuery({
    queryKey: identityQueryKey(normalizedRecipientAddress || 'pending-recipient'),
    queryFn: () => fetchIdentityProfile(normalizedRecipientAddress),
    enabled: Boolean(normalizedRecipientAddress),
    staleTime: 30 * 60 * 1000,
  });
  const recipientBaseName = recipientIdentityProfile?.name?.trim();

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
    [publicClient]
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
    data: recipientKeyData,
    isFetching: recipientKeyLoading,
    error: recipientKeyError,
    refetch: refetchRecipientKey,
  } = useQuery<{
    publicKey: string;
    type: 'vault' | 'passkey' | 'seed';
  } | null>({
    queryKey: ['recipient-key', recipientValue],
    enabled: Boolean(recipientValue),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!recipientValue) return null;
      const response = await fetch(
        `/api/send/getReceiverPublicKey?identity=${encodeURIComponent(recipientValue)}`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => null);
      if (
        !response.ok ||
        !payload?.success ||
        typeof payload.publicKey !== 'string' ||
        typeof payload.type !== 'string'
      ) {
        const message =
          (payload?.error as string | undefined) || 'Failed to resolve receiver public key.';
        throw new Error(message);
      }
      const type = payload.type === 'passkey' || payload.type === 'seed' ? payload.type : 'vault';
      return {
        publicKey: payload.publicKey,
        type,
      };
    },
  });

  const {
    data: quoteData,
    isLoading: quoteLoading,
    refetch: refetchQuote,
    error: quoteError,
  } = useQuery<QuoteData>({
    queryKey: ['quote-payment', chainId, MANAGER_CONTRACT_ADDRESS, tierInfo?.id],
    enabled: Boolean(
      isWalletLogin && publicClient && MANAGER_CONTRACT_ADDRESS && tierInfo && isOnSupportedChain
    ),
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

      const r1Decimals = 18;
      const quote: QuoteData = {
        usdcAmount,
        r1Amount,
        r1Decimals,
        maxR1WithSlippage: addTenPercentBuffer(r1Amount),
        minR1WithSlippage: subtractTenPercentBuffer(r1Amount),
      };

      try {
        const wethDecimals = 18;
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

  useEffect(() => {
    if (!isWalletLogin || !isOnSupportedChain) return;
    if (quoteError) {
      const message = (quoteError as Error)?.message?.trim().length
        ? (quoteError as Error).message
        : 'Failed to fetch payment quote.';
      toast.error(message, { toastId: 'payment-quote-error' });
    }
  }, [isWalletLogin, isOnSupportedChain, quoteError]);

  const {
    data: walletBalances,
    isFetching: balancesLoading,
    refetch: refetchWalletBalances,
  } = useQuery({
    queryKey: ['wallet-balances', chainId, MANAGER_CONTRACT_ADDRESS, walletAddress],
    enabled: Boolean(
      isWalletLogin && publicClient && walletAddress && MANAGER_CONTRACT_ADDRESS && isOnSupportedChain
    ),
    refetchOnWindowFocus: false,
    staleTime: 15_000,
    queryFn: async () => {
      if (!publicClient || !walletAddress) {
        throw new Error('Missing dependencies for wallet balances.');
      }

      const [r1Balance, usdcBalance, ethBalance] = await Promise.all([
        publicClient.readContract({
          address: R1_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: USDC_CONTRACT_ADDRESS,
          abi: Erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress],
        }) as Promise<bigint>,
        publicClient.getBalance({ address: walletAddress }),
      ]);

      return {
        r1Balance,
        usdcBalance,
        ethBalance,
      };
    },
  });

  const {
    data: freeAllowance,
    isFetching: freeAllowanceLoading,
    error: freeAllowanceError,
    refetch: refetchFreeAllowance,
  } = useQuery<FreeSendAllowance | null>({
    queryKey: ['free-allowance', identityValue],
    enabled: Boolean(hasIdentity),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!identityValue) return null;
      const response = await fetch(
        `/api/send/freeAllowance?identity=${encodeURIComponent(identityValue)}`
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload.allowance) {
        const message =
          (payload?.error as string | undefined) || 'Failed to fetch free micro-send allowance.';
        throw new Error(message);
      }
      return payload.allowance as FreeSendAllowance;
    },
  });

  useEffect(() => {
    if (freeAllowanceError) {
      const message =
        freeAllowanceError instanceof Error && freeAllowanceError.message
          ? freeAllowanceError.message
          : 'Failed to load free micro-send allowance.';
      toast.error(message, { toastId: 'free-allowance-error' });
    }
  }, [freeAllowanceError]);

  const isMicroTierSelected = tierInfo?.id === FREE_MICRO_TIER_ID;
  const freeRemaining = freeAllowance?.remaining ?? 0;
  const freeLimit = freeAllowance?.limit ?? FREE_MICRO_SENDS_PER_MONTH;
  const freeSendEligible = Boolean(isMicroTierSelected && freeRemaining > 0);
  const useFreeSend = isEmailLogin ? Boolean(isMicroTierSelected) : freeSendEligible;

  const quoteDataForDisplay = isWalletLogin && isOnSupportedChain ? quoteData : null;
  const walletBalancesForDisplay = isWalletLogin && isOnSupportedChain ? walletBalances : null;

  useEffect(() => {
    if (!isWalletLogin || !isOnSupportedChain) return;
    if (
      paymentAsset === 'ETH' &&
      quoteData &&
      (quoteData.wethAmount == null || quoteData.maxWethWithSlippage == null)
    ) {
      setPaymentAsset('R1');
    }
  }, [isWalletLogin, isOnSupportedChain, paymentAsset, quoteData]);

  const usdcDisplay = useMemo(() => {
    if (!quoteDataForDisplay) return null;
    const formatted = formatUnits(quoteDataForDisplay.usdcAmount, USDC_DECIMALS);
    return Number.parseFloat(formatted).toFixed(2);
  }, [quoteDataForDisplay]);

  const r1Display = useMemo(() => {
    if (!quoteDataForDisplay) return null;
    const formatted = formatUnits(quoteDataForDisplay.r1Amount, quoteDataForDisplay.r1Decimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteDataForDisplay]);

  const r1MaxDisplay = useMemo(() => {
    if (!quoteDataForDisplay) return null;
    const formatted = formatUnits(
      quoteDataForDisplay.maxR1WithSlippage,
      quoteDataForDisplay.r1Decimals
    );
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteDataForDisplay]);

  const r1MinDisplay = useMemo(() => {
    if (!quoteDataForDisplay) return null;
    const formatted = formatUnits(
      quoteDataForDisplay.minR1WithSlippage,
      quoteDataForDisplay.r1Decimals
    );
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteDataForDisplay]);

  const ethDisplay = useMemo(() => {
    if (!quoteDataForDisplay?.wethAmount || quoteDataForDisplay.wethDecimals == null) return null;
    const formatted = formatUnits(quoteDataForDisplay.wethAmount, quoteDataForDisplay.wethDecimals);
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteDataForDisplay]);

  const ethMaxDisplay = useMemo(() => {
    if (!quoteDataForDisplay?.maxWethWithSlippage || quoteDataForDisplay.wethDecimals == null)
      return null;
    const formatted = formatUnits(
      quoteDataForDisplay.maxWethWithSlippage,
      quoteDataForDisplay.wethDecimals
    );
    return Number.parseFloat(formatted).toFixed(6);
  }, [quoteDataForDisplay]);

  const disabled = useMemo(() => {
    if (!hasIdentity) return true;
    if (!recipientValue) return true;
    if (recipientResolutionLoading) return true;
    if (!file) return true;
    if (sending) return true;
    if (!tierInfo) return true;
    if (sizeExceedsLimit) return true;
    if (isEmailLogin) {
      if (!isMicroTierSelected) return true;
      if (freeAllowanceLoading) return true;
      return !freeSendEligible;
    }

    if (!isWalletLogin) return true;
    if (!isConnected) return true;
    if (!isOnSupportedChain) return true;
    if (!MANAGER_CONTRACT_ADDRESS) return true;
    if (useFreeSend && freeSendEligible) {
      if (freeAllowanceLoading) return true;
      return false;
    }
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
    hasIdentity,
    recipientValue,
    recipientResolutionLoading,
    file,
    sending,
    tierInfo,
    sizeExceedsLimit,
    isEmailLogin,
    isMicroTierSelected,
    freeAllowanceLoading,
    freeSendEligible,
    isWalletLogin,
    isConnected,
    isOnSupportedChain,
    MANAGER_CONTRACT_ADDRESS,
    quoteLoading,
    quoteData,
    balancesLoading,
    walletBalances,
    paymentAsset,
    useFreeSend,
  ]);

  const insufficientMessage = useMemo(() => {
    if (useFreeSend && freeSendEligible) return null;
    if (!quoteDataForDisplay || !walletBalancesForDisplay) return null;

    if (
      paymentAsset === 'R1' &&
      walletBalancesForDisplay.r1Balance < quoteDataForDisplay.maxR1WithSlippage
    ) {
      const needed = Number.parseFloat(
        formatUnits(quoteDataForDisplay.maxR1WithSlippage, quoteDataForDisplay.r1Decimals)
      ).toFixed(6);
      const available = Number.parseFloat(
        formatUnits(walletBalancesForDisplay.r1Balance, quoteDataForDisplay.r1Decimals)
      ).toFixed(6);
      return `You need ${needed} R1 (incl. buffer) but only have ${available} R1.`;
    }

    if (
      paymentAsset === 'USDC' &&
      walletBalancesForDisplay.usdcBalance < quoteDataForDisplay.usdcAmount
    ) {
      const needed = Number.parseFloat(
        formatUnits(quoteDataForDisplay.usdcAmount, USDC_DECIMALS)
      ).toFixed(2);
      const available = Number.parseFloat(
        formatUnits(walletBalancesForDisplay.usdcBalance, USDC_DECIMALS)
      ).toFixed(2);
      return `You need ${needed} USDC but only have ${available} USDC.`;
    }

    if (
      paymentAsset === 'ETH' &&
      quoteDataForDisplay.maxWethWithSlippage &&
      walletBalancesForDisplay.ethBalance < quoteDataForDisplay.maxWethWithSlippage &&
      quoteDataForDisplay.wethDecimals != null
    ) {
      const needed = Number.parseFloat(
        formatUnits(quoteDataForDisplay.maxWethWithSlippage, quoteDataForDisplay.wethDecimals)
      ).toFixed(6);
      const available = Number.parseFloat(
        formatUnits(walletBalancesForDisplay.ethBalance, quoteDataForDisplay.wethDecimals)
      ).toFixed(6);
      return `You need about ${needed} ETH (incl. buffer) but only have ${available} ETH.`;
    }

    return null;
  }, [paymentAsset, quoteDataForDisplay, walletBalancesForDisplay, useFreeSend, freeSendEligible]);

  const summaryItems = useMemo(() => {
    if (useFreeSend) {
      const helper = freeAllowanceLoading
        ? 'Checking your monthly free credits…'
        : freeSendEligible
          ? `${freeRemaining} out of ${freeLimit} free micro-sends left this month.`
          : 'No free micro-sends left this month.';
      return [
        {
          label: 'Payment',
          value: 'Free micro-send',
          helper,
        },
        {
          label: 'Tier',
          value: tierInfo?.label ?? 'Micro Send',
        },
      ];
    }
    if (!isWalletLogin || !quoteDataForDisplay) return [];
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
    useFreeSend,
    freeSendEligible,
    freeAllowanceLoading,
    freeRemaining,
    freeLimit,
    tierInfo,
    isWalletLogin,
    paymentAsset,
    quoteDataForDisplay,
    usdcDisplay,
    r1Display,
    r1MinDisplay,
    r1MaxDisplay,
    ethDisplay,
    ethMaxDisplay,
  ]);

  const activeBalanceDisplay = useMemo(() => {
    if (useFreeSend && freeSendEligible) return null;
    if (!walletBalancesForDisplay) return null;
    if (paymentAsset === 'R1') {
      return `${Number.parseFloat(
        formatUnits(walletBalancesForDisplay.r1Balance, quoteDataForDisplay?.r1Decimals ?? 18)
      ).toFixed(6)} R1`;
    }
    if (paymentAsset === 'USDC') {
      return `${Number.parseFloat(
        formatUnits(walletBalancesForDisplay.usdcBalance, USDC_DECIMALS)
      ).toFixed(2)} USDC`;
    }
    const decimals = quoteDataForDisplay?.wethDecimals ?? 18;
    return `${Number.parseFloat(formatUnits(walletBalancesForDisplay.ethBalance, decimals)).toFixed(
      6
    )} ETH`;
  }, [walletBalancesForDisplay, paymentAsset, quoteDataForDisplay, useFreeSend, freeSendEligible]);

  const paymentAmountByAsset = useMemo<Record<PaymentAsset, string | null>>(() => {
    const map: Record<PaymentAsset, string | null> = {
      R1: null,
      USDC: null,
      ETH: null,
    };
    if (!quoteDataForDisplay) return map;

    map.R1 = r1MaxDisplay ? `${r1MaxDisplay} R1 max` : r1Display ? `${r1Display} R1` : null;
    map.USDC = usdcDisplay ? `${usdcDisplay} USDC` : null;

    if (quoteDataForDisplay.maxWethWithSlippage && quoteDataForDisplay.wethDecimals != null) {
      map.ETH = ethMaxDisplay
        ? `${ethMaxDisplay} ETH max`
        : ethDisplay
          ? `${ethDisplay} ETH`
          : null;
    } else if (ethDisplay) {
      map.ETH = `${ethDisplay} ETH`;
    }

    return map;
  }, [ethDisplay, ethMaxDisplay, quoteDataForDisplay, r1Display, r1MaxDisplay, usdcDisplay]);

  const onSend = useCallback(async () => {
    if (!identityValue || !file || !recipientValue) return;
    const selectedFile = file;
    const targetIdentity = recipientValue;
    const initiatorIdentity = identityValue;
    const originalFilename = selectedFile.name;
    const originalMimeType =
      selectedFile.type && selectedFile.type.trim().length > 0
        ? selectedFile.type
        : 'application/octet-stream';
    const originalSize = selectedFile.size;
    const usingFreeSend = useFreeSend && (isWalletLogin ? freeSendEligible : true);
    setSending(true);
    setStatus(usingFreeSend ? 'Reserving free send…' : 'Preparing payment…');
    try {
      if (!tierInfo) {
        throw new Error('Selected file exceeds the 5 GB limit we support today.');
      }
      if (usingFreeSend && freeAllowanceLoading) {
        throw new Error('Checking free micro-send status. Please try again in a moment.');
      }
      if (isEmailLogin && !freeSendEligible) {
        throw new Error('No free micro-sends remaining this month.');
      }

      if (isWalletLogin) {
        if (!MANAGER_CONTRACT_ADDRESS) {
          throw new Error('Manager contract address is not configured.');
        }
        if (!publicClient) {
          throw new Error('Unable to connect to the network client.');
        }
        if (!chainId) {
          throw new Error('Wallet chain not detected.');
        }
        if (!isOnSupportedChain) {
          throw new Error(`Please switch to ${REQUIRED_CHAIN_NAME} before sending.`);
        }
      }

      const currentQuote =
        usingFreeSend || !isWalletLogin
          ? quoteData
          : (quoteData ?? (await refetchQuote().then((res) => res.data ?? null)));
      if (!usingFreeSend && isWalletLogin && !currentQuote) {
        throw new Error('Could not fetch payment quote.');
      }

      const maxR1Amount = currentQuote?.maxR1WithSlippage;
      const minR1Amount = currentQuote?.minR1WithSlippage;
      const usdcAmount = currentQuote?.usdcAmount;

      setStatus('Resolving recipient key…');
      let receiverKeyRecord = recipientKeyData ?? null;
      if (!receiverKeyRecord) {
        const refreshed = await refetchRecipientKey({ throwOnError: true });
        receiverKeyRecord = refreshed.data ?? null;
      }
      if (!receiverKeyRecord?.publicKey) {
        throw new Error('Failed to resolve receiver public key');
      }
      const receiverPublicKey = receiverKeyRecord.publicKey;
      const receiverKeySource = receiverKeyRecord.type;

      setStatus('Encrypting file…');
      const hasNote = typeof note === 'string' && note.trim().length > 0;
      const { encryptedFile, metadata: encryptionMetadata } = await encryptFileForRecipient({
        file: selectedFile,
        recipientPublicKey: receiverPublicKey,
        recipientAddress: targetIdentity,
        note: hasNote ? note : undefined,
      });
      encryptionMetadata.keySource = receiverKeySource;

      let paymentTxHash: string | undefined;
      let paymentAssetUsed: string | undefined = usingFreeSend ? 'FREE' : paymentAsset;

      if (usingFreeSend) {
        const nonce = Math.random().toString(16).slice(2, 10);
        paymentTxHash = `${FREE_PAYMENT_REFERENCE_PREFIX}${initiatorIdentity}:${Date.now()}:${nonce}`;
        setStatus('Applying free micro-send…');
      } else if (isWalletLogin) {
        if (!publicClient || !walletAddress) {
          throw new Error('Wallet is not connected.');
        }
        if (paymentAsset === 'R1') {
          if (!maxR1Amount || !minR1Amount) {
            throw new Error('Missing quote for R1 payment.');
          }
          setStatus('Checking R1 balance…');
          const r1Balance = (await publicClient.readContract({
            address: R1_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress],
          })) as bigint;
          if (r1Balance < maxR1Amount) {
            throw new Error('Not enough R1 to cover the burn and buffer.');
          }

          setStatus('Checking R1 allowance…');
          const allowance = (await publicClient.readContract({
            address: R1_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'allowance',
            args: [walletAddress, MANAGER_CONTRACT_ADDRESS],
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
          if (!usdcAmount || !minR1Amount) {
            throw new Error('Missing quote for USDC payment.');
          }
          setStatus('Checking USDC balance…');
          const usdcBalance = (await publicClient.readContract({
            address: USDC_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress],
          })) as bigint;
          if (usdcBalance < usdcAmount) {
            throw new Error('Not enough USDC to cover the payment.');
          }

          setStatus('Checking USDC allowance…');
          const usdcAllowance = (await publicClient.readContract({
            address: USDC_CONTRACT_ADDRESS,
            abi: Erc20Abi,
            functionName: 'allowance',
            args: [walletAddress, MANAGER_CONTRACT_ADDRESS],
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
          if (!currentQuote) {
            throw new Error('Missing quote for ETH payment.');
          }
          if (
            !currentQuote.wethAmount ||
            !currentQuote.maxWethWithSlippage ||
            currentQuote.wethDecimals == null
          ) {
            throw new Error('Unable to quote ETH payment right now.');
          }
          if (!minR1Amount) {
            throw new Error('Missing quote for ETH payment.');
          }

          setStatus('Checking ETH balance…');
          const ethBalance = await publicClient.getBalance({ address: walletAddress });
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
      } else {
        throw new Error('Email logins can only use free micro-sends.');
      }

      if (!paymentTxHash) {
        throw new Error('Payment was not confirmed.');
      }

      const startedAt = Date.now();
      setStatus(isWalletLogin ? 'Signing upload…' : 'Preparing upload…');
      const plaintextBytes =
        typeof encryptionMetadata.plaintextLength === 'number' &&
        Number.isFinite(encryptionMetadata.plaintextLength)
          ? encryptionMetadata.plaintextLength
          : originalSize;
      const effectiveChainId = isWalletLogin ? chainId : 0;
      const handshakeMsg = buildSendHandshakeMessage({
        initiator: initiatorIdentity,
        recipient: targetIdentity,
        chainId: effectiveChainId,
        paymentTxHash,
        sentAt: startedAt,
        tierId: tierInfo.id,
        plaintextBytes,
        ciphertextBytes: encryptedFile.size,
        originalFilename,
        encryption: encryptionMetadata,
      });
      let signature: string | undefined;
      if (isWalletLogin) {
        if (!signMessageAsync) {
          throw new Error('Wallet signer not available.');
        }
        signature = await signMessageAsync({ message: handshakeMsg });
      }

      setStatus('Uploading encrypted file…');
      const formData = new FormData();
      formData.append('file', encryptedFile);
      formData.append('initiator', initiatorIdentity);
      formData.append('recipient', targetIdentity);
      formData.append('handshakeMessage', handshakeMsg);
      if (signature) {
        formData.append('signature', signature);
      }
      formData.append('sentAt', String(startedAt));
      formData.append('paymentTxHash', paymentTxHash);
      formData.append('chainId', String(effectiveChainId));
      formData.append('tierId', String(tierInfo.id));
      formData.append('paymentAsset', paymentAssetUsed ?? paymentAsset);
      formData.append('paymentType', usingFreeSend ? 'FREE' : 'PAID');
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
        throw new Error(payload?.error || `Upload failed with status ${response.status}.`);
      }

      setFile(null);
      setRecipientInput('');
      setNote('');
      setStatus(null);
      if (isWalletLogin) {
        await refetchQuote();
        await refetchWalletBalances();
      }
      await refetchFreeAllowance();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ratio1:upload-completed'));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      const recipientDisplay =
        normalizedRecipientInput ||
        (targetIdentity && targetIdentity.length > 10
          ? `${targetIdentity.slice(0, 6)}…${targetIdentity.slice(-4)}`
          : targetIdentity) ||
        'recipient';
      const fileLabel = originalFilename || 'your file';
      const fileDisplay =
        fileLabel.length > 60 ? `${fileLabel.slice(0, 40)}…${fileLabel.slice(-15)}` : fileLabel;
      toast.success(`Sent ${fileDisplay} to ${recipientDisplay}.`);
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to send';
      const friendly =
        typeof message === 'string' && message.trim().length > 0
          ? message
          : 'Failed to send file. Please try again.';
      toast.error(friendly, { toastId: 'send-file-error' });
      setStatus(null);
    } finally {
      setSending(false);
    }
  }, [
    identityValue,
    recipientValue,
    chainId,
    file,
    note,
    publicClient,
    quoteData,
    recipientKeyData,
    normalizedRecipientInput,
    refetchQuote,
    refetchRecipientKey,
    refetchWalletBalances,
    refetchFreeAllowance,
    signMessageAsync,
    isOnSupportedChain,
    tierInfo,
    freeSendEligible,
    freeAllowanceLoading,
    useFreeSend,
    paymentAsset,
    waitForTransaction,
    writeContractAsync,
    isWalletLogin,
    isEmailLogin,
    walletAddress,
  ]);

  const statusLabel = status ?? 'Processing…';
  const buttonContent = wrongNetwork ? (
    `Switch to ${REQUIRED_CHAIN_NAME}`
  ) : sending ? (
    <span className="row" style={{ gap: 8, justifyContent: 'center' }}>
      <span className="spinner" aria-hidden="true" style={{ width: 16, height: 16 }} />
      <span>{statusLabel}</span>
    </span>
  ) : isEmailLogin ? (
    isMicroTierSelected ? (
      'Send free micro-send'
    ) : (
      'Free micro-sends only'
    )
  ) : useFreeSend && freeSendEligible ? (
    'Send free micro-send'
  ) : (
    `Send with ${paymentAsset}`
  );

  const copyRecipientIdentity = useCallback(async () => {
    if (!recipientValue) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(recipientValue);
      toast.success('Recipient copied.');
    } catch (err) {
      console.error('[send] copy recipient identity failed', err);
      toast.error('Unable to copy recipient.');
    }
  }, [recipientValue]);

  const copyRecipientBasename = useCallback(async () => {
    if (!recipientBaseName) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(recipientBaseName);
      toast.success('Basename copied.');
    } catch (err) {
      console.error('[send] copy recipient basename failed', err);
      toast.error('Unable to copy basename.');
    }
  }, [recipientBaseName]);

  return (
    <div className="card col" style={{ gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Send a file</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {isEmailLogin
            ? 'Email logins use free micro-sends (≤50 MB) each month. Encrypt and send securely through the Ratio1 Edge Nodes network.'
            : 'Pay in R1, ETH, or USDC - or use your 3 free micro-sends (≤50 MB) each month. Encrypt and send securely through the Ratio1 Edge Nodes network; all tokens are converted to R1 and burned.'}
        </div>
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Recipient email or wallet address
        </span>
        <input
          className="input"
          placeholder="email@domain.com or 0x… / yourname.base.eth"
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value.trim())}
          autoComplete="off"
          data-1p-ignore
        />
        {!normalizedRecipientInput ? null : recipientValue ? (
          <div className="col" style={{ gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              {recipientEmail
                ? 'Email looks valid'
                : recipientResolvedFromName
                  ? 'Basename resolved to address'
                  : 'Address looks valid'}
            </span>
            <div
              className="card col"
              style={{
                gap: 6,
                alignSelf: 'flex-start',
                width: 'fit-content',
                maxWidth: '100%',
                marginTop: 8,
              }}
            >
              <div className="muted" style={{ fontSize: 12 }}>
                Recipient
              </div>
              <div className="col" style={{ gap: 4 }}>
                {recipientBaseName ? (
                  <button
                    type="button"
                    onClick={copyRecipientBasename}
                    aria-label="Copy recipient basename"
                    title="Copy recipient basename"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      textAlign: 'left',
                      color: 'var(--accent)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {recipientBaseName}
                  </button>
                ) : null}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--accent)',
                  }}
                >
                  <button
                    type="button"
                    onClick={copyRecipientIdentity}
                    aria-label="Copy recipient"
                    title="Copy recipient"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
                      {recipientEmail ?? shortRecipientAddress}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {recipientKeyLoading ? (
              <span className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Checking recipient encryption mode…
              </span>
            ) : recipientKeyError ? (
              <span style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>
                {recipientKeyError instanceof Error
                  ? recipientKeyError.message
                  : 'Unable to verify recipient encryption mode.'}
              </span>
            ) : recipientKeyData ? (
              <span className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {recipientKeyData.type === 'vault'
                  ? 'Recipient uses Light encryption (vault managed key).'
                  : 'Recipient has Pro encryption.'}{' '}
                <a
                  className="accentLink"
                  href="/docs#encryption-modes"
                  target="_blank"
                  rel="noreferrer"
                >
                  Learn about 3send encryption modes
                </a>
                .
              </span>
            ) : null}
          </div>
        ) : recipientResolutionLoading ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Resolving name to address…
          </span>
        ) : recipientResolutionError ? (
          <span style={{ color: '#f87171', fontSize: 12 }}>
            {recipientResolutionError instanceof Error
              ? recipientResolutionError.message
              : 'Could not resolve this name to an address.'}
          </span>
        ) : (
          <span style={{ color: '#f87171', fontSize: 12 }}>
            Enter a valid email or wallet address
          </span>
        )}
      </label>

      <div className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Select file
        </span>
        <div
          className="dropzone"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}
        >
          {/* Hidden native input; triggered by the styled button */}
          <input
            id="sendfile-input"
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
            }}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          />
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="button accent"
              onClick={() => fileInputRef.current?.click()}
              aria-controls="sendfile-input"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5-5 5 5" />
                <path d="M12 5v12" />
              </svg>
              {file ? 'Change file' : 'Choose file'}
            </button>
            <span className="muted mono" style={{ fontSize: 12 }}>
              Max file size 5 GB.
            </span>
          </div>
          {file && (
            <div style={{ marginTop: 8, alignSelf: 'center', textAlign: 'center' }}>
              <div>
                <strong>{file.name}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6, color: 'var(--accent)' }}>
          The file will be available for 7 days, after which it will be deleted from the protocol.
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
            {isMicroTierSelected && (
              <div
                className="col"
                style={{
                  gap: 6,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px dashed var(--accent)',
                  background: '#fff7ed',
                }}
              >
                <div
                  className="row"
                  style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <div className="col" style={{ gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>Free micro-sends</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {freeAllowanceLoading
                        ? 'Checking your monthly credits…'
                        : `You have ${freeRemaining} out of ${freeLimit} free micro-sends left this month.`}
                    </span>
                  </div>
                </div>
                {useFreeSend && freeSendEligible && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    No payment required for micro-sends while credits remain.
                  </span>
                )}
                {!freeSendEligible && !freeAllowanceLoading && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {isEmailLogin
                      ? 'All monthly free micro-sends are used. Credits reset at the start of next month.'
                      : 'All monthly free micro-sends are used. Paid transfers apply from here.'}
                  </span>
                )}
              </div>
            )}
            {isEmailLogin && !isMicroTierSelected && file && !sizeExceedsLimit && (
              <div
                className="col"
                style={{
                  gap: 6,
                  padding: 12,
                  borderRadius: 12,
                  background: '#fff7ed',
                  border: '1px solid rgba(251, 146, 60, 0.4)',
                  color: '#9a3412',
                  fontSize: 12,
                }}
              >
                Email logins are limited to free micro-sends (≤50 MB). Reduce the file size to
                continue.
              </div>
            )}
            {!isEmailLogin && quoteLoading && !useFreeSend && (
              <div className="muted" style={{ fontSize: 12 }}>
                Fetching payment quote…
              </div>
            )}
            <div className="col" style={{ gap: 12 }}>
              {isEmailLogin ? (
                useFreeSend ? (
                  <div
                    className="col"
                    style={{
                      gap: 6,
                      padding: 12,
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>No payment required</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {freeAllowanceLoading
                        ? 'Checking your free micro-sends…'
                        : freeSendEligible
                          ? 'This transfer uses one of your monthly free micro-sends.'
                          : 'No free micro-sends left this month.'}
                    </span>
                  </div>
                ) : null
              ) : !useFreeSend ? (
                !quoteLoading &&
                !quoteError &&
                quoteData && (
                  <div className="col" style={{ gap: 8 }}>
                    <span
                      className="muted mono"
                      style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}
                    >
                      Select your preferred payment asset.
                    </span>
                    <div className="paymentOptions">
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
                            className="button paymentOption"
                            disabled={isDisabled}
                            onClick={() => {
                              if (isDisabled) return;
                              setPaymentAsset(option.id);
                            }}
                            style={{
                              padding: '12px 16px',
                              textAlign: 'left' as const,
                              borderRadius: 12,
                              border: isActive
                                ? '1px solid var(--accent)'
                                : '1px solid rgba(148, 163, 184, 0.6)',
                              background: isActive ? '#fefce8' : '#f9fafb',
                              color: '#0f172a',
                              opacity: isDisabled ? 0.5 : 1,
                              cursor: isDisabled ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              transition:
                                'background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
                              boxShadow: isActive
                                ? '0 6px 18px rgba(247, 147, 26, 0.15)'
                                : '0 4px 16px rgba(15, 23, 42, 0.07)',
                            }}
                          >
                            <div
                              className="row"
                              style={{ justifyContent: 'space-between', gap: 8 }}
                            >
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
                )
              ) : (
                <div
                  className="col"
                  style={{
                    gap: 6,
                    padding: 12,
                    borderRadius: 12,
                    background: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.4)',
                    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>No payment required</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {freeAllowanceLoading
                      ? 'Checking your free micro-sends…'
                      : freeSendEligible
                        ? 'This transfer uses one of your monthly free micro-sends.'
                        : 'No free micro-sends left this month.'}
                  </span>
                </div>
              )}

              {summaryItems.length > 0 && (
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
              )}
            </div>
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

      {isWalletLogin && !isConnected && (
        <div className="muted" style={{ fontSize: 12 }}>
          Connect your wallet to continue.
        </div>
      )}
      {isWalletLogin && wrongNetwork && (
        <div style={{ fontSize: 12, color: '#dc2626' }}>
          Switch your wallet network to {REQUIRED_CHAIN_NAME} to send files.
        </div>
      )}
      {file && (
        <div className="col" style={{ alignItems: 'flex-end', gap: 6 }}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="button"
              onClick={onSend}
              disabled={disabled}
              aria-busy={sending || undefined}
              aria-live="polite"
            >
              {buttonContent}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
