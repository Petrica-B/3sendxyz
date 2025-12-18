'use client';

import { LoginButton } from '@/components/LoginButton';
import EncryptionModesSection, {
  type PasskeyRegistrationStep,
} from '@/components/profile/EncryptionModesSection';
import { encodeBase64 } from '@/lib/encryption';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { buildRegisteredKeyMessage } from '@/lib/keyAccess';
import {
  deriveSeedKeyPair,
  fingerprintMnemonic,
  generateMnemonicKeyPair,
  isValidMnemonic,
} from '@/lib/keys';
import { shortAddress } from '@/lib/format';
import { derivePasskeyX25519KeyPair, randomPrfSalt } from '@/lib/passkeyClient';
import { useAuthStatus } from '@/lib/useAuthStatus';
import type {
  RegisteredKeyRecord,
  RegisteredPasskeyRecord,
  RegisteredSeedRecord,
  UserProfile,
} from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useSignMessage } from 'wagmi';
import { loadProfile, saveProfile } from './storage';
import { useRegisteredKeyFingerprint } from './useRegisteredKeyFingerprint';

type AttestationResponseWithPublicKey = AuthenticatorAttestationResponse & {
  getPublicKey?: () => ArrayBuffer | null;
  getPublicKeyAlgorithm?: () => number | null;
};

type PasskeyCredential = PublicKeyCredential & {
  response: AttestationResponseWithPublicKey;
};

export default function ProfilePage() {
  const { authMethod, canUseWallet, isLoggedIn, identityValue } = useAuthStatus();
  const { signMessageAsync } = useSignMessage();
  const normalizedAddress =
    canUseWallet && identityValue ? identityValue.trim().toLowerCase() : '';
  const { data: identityProfile } = useQuery({
    queryKey: identityQueryKey(normalizedAddress),
    queryFn: () => fetchIdentityProfile(normalizedAddress),
    enabled: Boolean(normalizedAddress && canUseWallet),
    staleTime: 30 * 60 * 1000,
  });
  const hasBaseName = Boolean(identityProfile?.name?.trim());
  const baseName = identityProfile?.name?.trim();
  const shortAddr = normalizedAddress ? shortAddress(normalizedAddress, 4) : '';
  const [profile, setProfile] = useState<UserProfile>({});
  const [keyLabelInput, setKeyLabelInput] = useState('');
  const [privKeyOnce, setPrivKeyOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registeredKeyRecord, setRegisteredKeyRecord] = useState<RegisteredKeyRecord | null>(null);
  const [registeredKeyLoading, setRegisteredKeyLoading] = useState(false);
  const [registeredKeyBusy, setRegisteredKeyBusy] = useState(false);
  const [, setRegisteredKeyError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

  const passkeyRecord = useMemo<RegisteredPasskeyRecord | null>(() => {
    return registeredKeyRecord?.type === 'passkey' ? registeredKeyRecord : null;
  }, [registeredKeyRecord]);

  const seedKeyRecord = useMemo<RegisteredSeedRecord | null>(() => {
    return registeredKeyRecord?.type === 'seed' ? registeredKeyRecord : null;
  }, [registeredKeyRecord]);

  const registeredKeyFingerprint = useRegisteredKeyFingerprint(registeredKeyRecord);
  useEffect(() => {
    if (seedKeyRecord?.label) {
      setKeyLabelInput(seedKeyRecord.label.slice(0, 15));
    }
  }, [seedKeyRecord]);

  const passkeyBusy = registeredKeyBusy;

  const passkeyCredentialPreview = useMemo(() => {
    if (!passkeyRecord?.credentialId) return null;
    const id = passkeyRecord.credentialId;
    if (id.length <= 16) return id;
    return `${id.slice(0, 12)}…${id.slice(-4)}`;
  }, [passkeyRecord]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPasskeySupported('PublicKeyCredential' in window);
  }, []);

  useEffect(() => {
    if (!identityValue) return;
    const p = loadProfile(identityValue);
    setProfile(p);
    // no handle UI for now
    setKeyLabelInput('');
  }, [identityValue]);

  useEffect(() => {
    if (!identityValue) {
      setRegisteredKeyRecord(null);
      setRegisteredKeyLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setRegisteredKeyLoading(true);
      setRegisteredKeyError(null);
      try {
        const params = new URLSearchParams({ identity: identityValue });
        const res = await fetch(`/api/keys/status?${params.toString()}`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to fetch key status');
        }
        if (!cancelled) {
          setRegisteredKeyRecord(payload.record ?? null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) {
          setRegisteredKeyRecord(null);
          const friendly =
            message === 'Unknown error'
              ? 'Unable to check your encryption settings. Please try again.'
              : message;
          setRegisteredKeyError(friendly);
          toast.error(friendly, { toastId: 'profile-key-error' });
        }
      } finally {
        if (!cancelled) {
          setRegisteredKeyLoading(false);
        }
      }
    };
    run().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [identityValue]);

  // handle management temporarily removed

  // Key label is captured when generating or regenerating the pair

  const registerSeedKey = useCallback(
    async (params: { mnemonic: string; fingerprint?: string; label?: string }) => {
      const { mnemonic, fingerprint, label } = params;
      if (!identityValue) {
        throw new Error('Login required.');
      }

      setRegisteredKeyBusy(true);
      setRegisteredKeyError(null);
      try {
        const { publicKeyBase64 } = await deriveSeedKeyPair(mnemonic);
        if (canUseWallet && !signMessageAsync) {
          throw new Error('Wallet signer not available. Connect your wallet to continue.');
        }
        const message = canUseWallet
          ? buildRegisteredKeyMessage(identityValue, publicKeyBase64)
          : undefined;
        const signature = message ? await signMessageAsync({ message }) : undefined;
        const registerRes = await fetch('/api/keys/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'seed',
            identity: identityValue,
            signature,
            message,
            seedPublicKey: publicKeyBase64,
            label,
            fingerprint,
          }),
        });
        const payload = await registerRes.json().catch(() => null);
        if (!registerRes.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to register seed key');
        }
        setRegisteredKeyRecord(payload.record ?? null);
        setRegisteredKeyError(null);
        toast.success('Recovery phrase registered.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ratio1:registered-key-updated', { detail: { identity: identityValue } })
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to register seed key';
        setRegisteredKeyError(message);
        toast.error(message?.trim().length ? message : 'Failed to register seed key.', {
          toastId: 'profile-seed-error',
        });
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setRegisteredKeyBusy(false);
      }
    },
    [identityValue, canUseWallet, signMessageAsync]
  );

  const onGenerateKeys = useCallback(async () => {
    if (!identityValue) return;
    setBusy(true);
    try {
      const label = keyLabelInput.trim().slice(0, 15);
      if (!label) {
        toast.error('Add a short label so you know which device this key belongs to.');
        return;
      }
      const gen = await generateMnemonicKeyPair();
      // Save only fingerprint + metadata + label (no private words)
      const next: UserProfile = {
        ...profile,
        keyLabel: label,
        fingerprintHex: gen.fingerprintHex,
        keyCreatedAt: gen.createdAt,
        seedMnemonic: gen.mnemonic,
      };
      saveProfile(identityValue, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
      await registerSeedKey({ mnemonic: gen.mnemonic, fingerprint: gen.fingerprintHex, label });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate key pair';
      toast.error(message, { toastId: 'profile-seed-error' });
    } finally {
      setBusy(false);
    }
  }, [identityValue, profile, keyLabelInput, registerSeedKey]);

  const onRegenerateKeys = useCallback(async () => {
    if (!identityValue) return;
    setBusy(true);
    try {
      const label = keyLabelInput.trim().slice(0, 15);
      if (!label) {
        toast.error('Add a short label so you know which device this key belongs to.');
        return;
      }
      const gen = await generateMnemonicKeyPair();
      const next: UserProfile = {
        ...profile,
        keyLabel: label,
        fingerprintHex: gen.fingerprintHex,
        keyCreatedAt: gen.createdAt,
        seedMnemonic: gen.mnemonic,
      };
      saveProfile(identityValue, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
      await registerSeedKey({ mnemonic: gen.mnemonic, fingerprint: gen.fingerprintHex, label });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate key pair';
      toast.error(message, { toastId: 'profile-seed-error' });
    } finally {
      setBusy(false);
    }
  }, [identityValue, profile, keyLabelInput, registerSeedKey]);

  const downloadPrivateKey = useCallback(() => {
    if (!privKeyOnce) return;
    const blob = new Blob([privKeyOnce], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '3send-private-key-words.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [privKeyOnce]);

  const copyToClipboard = useCallback(
    async (value: string, successMessage: string, fallbackMessage?: string) => {
      if (!value) return;
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        toast.error(fallbackMessage ?? 'Clipboard not available. Please copy manually.');
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        toast.success(successMessage);
      } catch {
        toast.error(fallbackMessage ?? 'Failed to copy. Please copy manually.');
      }
    },
    []
  );

  const copyPrivateKey = useCallback(async () => {
    if (!privKeyOnce) return;
    await copyToClipboard(
      privKeyOnce,
      'Recovery phrase copied. Store it securely.',
      'Failed to copy. Please select and copy manually.'
    );
  }, [copyToClipboard, privKeyOnce]);

  const hidePrivKeyOnce = useCallback(() => {
    setPrivKeyOnce(null);
  }, []);

  const revealStoredSeed = useCallback(() => {
    if (registeredKeyRecord?.type !== 'seed') {
      toast.error('Recovery phrase is not the active encryption method.');
      return;
    }
    const stored = profile.seedMnemonic?.trim();
    if (!stored) {
      toast.error('No saved recovery phrase found on this device.');
      return;
    }
    setPrivKeyOnce(stored);
  }, [profile.seedMnemonic, registeredKeyRecord]);

  const recoverSeedFromInput = useCallback(
    async (mnemonicInput: string) => {
      if (!identityValue) {
        throw new Error('Login required to continue.');
      }
      if (registeredKeyRecord?.type !== 'seed') {
        throw new Error('Recovery phrase is not the active key for this profile.');
      }

      const normalized = mnemonicInput.trim().toLowerCase().split(/\s+/).join(' ');
      if (!normalized) {
        throw new Error('Enter your 24-word recovery phrase to continue.');
      }
      const words = normalized.split(' ');
      if (words.length !== 24) {
        throw new Error('Recovery phrase must contain exactly 24 words.');
      }

      if (!isValidMnemonic(normalized)) {
        throw new Error('Recovery phrase has an invalid checksum or word.');
      }

      const { publicKeyBase64 } = await deriveSeedKeyPair(normalized);
      if (publicKeyBase64 !== registeredKeyRecord.publicKey) {
        throw new Error('That recovery phrase does not match the registered key.');
      }

      const fingerprintHex = await fingerprintMnemonic(normalized);
      if (seedKeyRecord?.fingerprint && fingerprintHex !== seedKeyRecord.fingerprint) {
        console.warn('[keys] recovered fingerprint does not match registered fingerprint');
      }

      const nextProfile: UserProfile = {
        ...profile,
        seedMnemonic: normalized,
        fingerprintHex,
        keyLabel: seedKeyRecord?.label ?? profile.keyLabel,
        keyCreatedAt: registeredKeyRecord.createdAt ?? profile.keyCreatedAt,
      };
      saveProfile(identityValue, nextProfile);
      setProfile(nextProfile);
      hidePrivKeyOnce();
      toast.success(
        'Recovery phrase saved on this device. Reveal it from this profile when needed.'
      );
    },
    [identityValue, hidePrivKeyOnce, profile, registeredKeyRecord, seedKeyRecord]
  );

  const onRegisterPasskey = useCallback(
    async (onStatusChange?: (step: PasskeyRegistrationStep) => void) => {
      if (!identityValue) return;
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        toast.error('Passkeys are not supported in this environment.');
        return;
      }
      if (!window.PublicKeyCredential) {
        toast.error('Passkeys are not supported by this browser.');
        return;
      }
      if (canUseWallet && !signMessageAsync) {
        toast.error('Wallet signer not available. Connect your wallet to continue.');
        return;
      }

      setRegisteredKeyBusy(true);
      setRegisteredKeyError(null);
      try {
        onStatusChange?.('prompt-device');
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const userId = new TextEncoder().encode(identityValue.toLowerCase());

        const creationOptions: PublicKeyCredentialCreationOptions = {
          challenge,
          rp: {
            name: '3send',
            id: window.location.hostname,
          },
          user: {
            id: userId,
            name: `3send: ${identityValue}`,
            displayName: `3send: ${identityValue}`,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -8 },
            { type: 'public-key', alg: -7 },
          ],
          timeout: 60_000,
          attestation: 'direct',
          authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
          },
        };

        const credential = (await navigator.credentials.create({
          publicKey: creationOptions,
        })) as PasskeyCredential | null;

        if (!credential) {
          throw new Error('Passkey registration was cancelled.');
        }

        const attestationResponse = credential.response;
        const algorithm =
          typeof attestationResponse.getPublicKeyAlgorithm === 'function'
            ? attestationResponse.getPublicKeyAlgorithm()
            : undefined;

        const credentialIdB64 = encodeBase64(new Uint8Array(credential.rawId));
        const prfSaltBytes = randomPrfSalt();
        onStatusChange?.('derive-key');
        const { publicKey: x25519PublicKey } = await derivePasskeyX25519KeyPair({
          credentialIdB64,
          salt: prfSaltBytes,
        });
        const prfSaltB64 = encodeBase64(prfSaltBytes);
        const message = canUseWallet
          ? buildRegisteredKeyMessage(identityValue, x25519PublicKey)
          : undefined;
        if (message) {
          onStatusChange?.('sign-wallet');
        }
        const signature = message ? await signMessageAsync({ message }) : undefined;

        onStatusChange?.('register-server');
        const registerRes = await fetch('/api/keys/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'passkey',
            identity: identityValue,
            signature,
            message,
            credentialId: credentialIdB64,
            passkeyPublicKey: x25519PublicKey,
            algorithm,
            prfSalt: prfSaltB64,
          }),
        });
        const payload = await registerRes.json().catch(() => null);
        if (!registerRes.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to register passkey');
        }
        setRegisteredKeyRecord(payload.record ?? null);
        setRegisteredKeyError(null);
        setProfile((prev) => {
          const next: UserProfile = { ...prev };
          delete (next as Record<string, unknown>).keyLabel;
          delete (next as Record<string, unknown>).fingerprintHex;
          delete (next as Record<string, unknown>).keyCreatedAt;
          delete (next as Record<string, unknown>).seedMnemonic;
          saveProfile(identityValue, next);
          return next;
        });
        setKeyLabelInput('');
        hidePrivKeyOnce();
        toast.success('Passkey registered.');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ratio1:registered-key-updated', { detail: { identity: identityValue } })
          );
        }
      } catch (err) {
        let message =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
        if (
          err instanceof DOMException &&
          (err.name === 'AbortError' || err.name === 'NotAllowedError')
        ) {
          message = 'Passkey registration was cancelled.';
        }
        setRegisteredKeyError(message);
        console.error('[keys] register failed', err);
        if (message && !/cancel/i.test(message) && !/not allowed/i.test(message)) {
          toast.error(message, { toastId: 'profile-passkey-error' });
        }
      } finally {
        setRegisteredKeyBusy(false);
      }
    },
    [identityValue, canUseWallet, signMessageAsync, hidePrivKeyOnce]
  );

  const copyIdentity = useCallback(async () => {
    if (!identityValue) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(identityValue);
      toast.success(canUseWallet ? 'Address copied.' : 'Email copied.');
    } catch (err) {
      console.error('[profile] copy identity failed', err);
      toast.error('Unable to copy identity.');
    }
  }, [identityValue, canUseWallet]);

  const copyBasename = useCallback(async () => {
    if (!baseName) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(baseName);
      toast.success('Basename copied.');
    } catch (err) {
      console.error('[profile] copy basename failed', err);
      toast.error('Unable to copy basename.');
    }
  }, [baseName]);

  if (!isLoggedIn) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">My Profile</div>
          <div className="subhead">Log in to manage your keys.</div>
          <div style={{ marginTop: 12 }}>
            <LoginButton />
          </div>
        </div>
      </main>
    );
  }

  if (!identityValue && authMethod === 'mixed') {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">My Profile</div>
          <div className="subhead">Multiple logins active. Disconnect one to continue.</div>
        </div>
      </main>
    );
  }

  if (!identityValue) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">My Profile</div>
          <div className="subhead">Select a login method to continue.</div>
        </div>
      </main>
    );
  }

  const hasActiveSeedMnemonic =
    registeredKeyRecord?.type === 'seed' && Boolean(profile.seedMnemonic?.trim());

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">My Profile</div>
      </div>

      <div
        className="card col"
        style={{
          gap: 6,
          alignSelf: 'flex-start',
          width: 'fit-content',
          maxWidth: '100%',
        }}
      >
        <div className="muted" style={{ fontSize: 12 }}>
          Connected as
        </div>
        <div className="col" style={{ gap: 4 }}>
          {hasBaseName && canUseWallet && identityProfile?.name ? (
            <button
              type="button"
              onClick={copyBasename}
              aria-label="Copy basename"
              title="Copy basename"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                textAlign: 'left',
                color: 'var(--accent)',
                fontWeight: 800,
                fontSize: 16,
                cursor: 'pointer',
              }}
            >
              {identityProfile.name}
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
              onClick={copyIdentity}
              aria-label={canUseWallet ? 'Copy address' : 'Copy email'}
              title={canUseWallet ? 'Copy address' : 'Copy email'}
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
                {canUseWallet ? shortAddr : identityValue}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Handle settings removed for now */}

      <EncryptionModesSection
        activeMode={registeredKeyRecord ? 'pro' : 'light'}
        activeMethod={registeredKeyRecord?.type ?? null}
        registeredKeyRecord={registeredKeyRecord}
        registeredKeyLoading={registeredKeyLoading}
        registeredKeyFingerprint={registeredKeyFingerprint}
        passkeySupported={passkeySupported}
        passkeyBusy={passkeyBusy}
        passkeyRecord={passkeyRecord}
        passkeyCredentialPreview={passkeyCredentialPreview}
        seedKeyRecord={seedKeyRecord}
        profile={profile}
        keyLabelInput={keyLabelInput}
        onKeyLabelChange={setKeyLabelInput}
        onGenerateSeed={onGenerateKeys}
        onRegenerateSeed={onRegenerateKeys}
        onRegisterPasskey={onRegisterPasskey}
        privKeyOnce={privKeyOnce}
        copyPrivateKey={copyPrivateKey}
        downloadPrivateKey={downloadPrivateKey}
        copyToClipboard={copyToClipboard}
        hasStoredSeed={hasActiveSeedMnemonic}
        needsSeedRecovery={registeredKeyRecord?.type === 'seed' && !hasActiveSeedMnemonic}
        onRevealStoredSeed={revealStoredSeed}
        onRecoverSeed={recoverSeedFromInput}
        isRecoveryPhraseVisible={registeredKeyRecord?.type === 'seed' && Boolean(privKeyOnce)}
        onHideRecoveryPhrase={hidePrivKeyOnce}
      />
    </main>
  );
}
