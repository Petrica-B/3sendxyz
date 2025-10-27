'use client';

import EncryptionModesSection from '@/components/profile/EncryptionModesSection';
import HandleSection from '@/components/profile/HandleSection';
import { encodeBase64 } from '@/lib/encryption';
import { shortAddress } from '@/lib/format';
import { buildRegisteredKeyMessage } from '@/lib/keyAccess';
import { deriveSeedKeyPair, generateMnemonicKeyPair } from '@/lib/keys';
import { derivePasskeyX25519KeyPair, randomPrfSalt } from '@/lib/passkeyClient';
import type {
  RegisteredKeyRecord,
  RegisteredPasskeyRecord,
  RegisteredSeedRecord,
  UserProfile,
} from '@/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { loadProfile, normalizeHandle, saveProfile } from './storage';
import { useRegisteredKeyFingerprint } from './useRegisteredKeyFingerprint';

type AttestationResponseWithPublicKey = AuthenticatorAttestationResponse & {
  getPublicKey?: () => ArrayBuffer | null;
  getPublicKeyAlgorithm?: () => number | null;
};

type PasskeyCredential = PublicKeyCredential & {
  response: AttestationResponseWithPublicKey;
};

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState<UserProfile>({});
  const [handleInput, setHandleInput] = useState('');
  const [keyLabelInput, setKeyLabelInput] = useState('');
  const [privKeyOnce, setPrivKeyOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registeredKeyRecord, setRegisteredKeyRecord] = useState<RegisteredKeyRecord | null>(null);
  const [registeredKeyLoading, setRegisteredKeyLoading] = useState(false);
  const [registeredKeyBusy, setRegisteredKeyBusy] = useState(false);
  const [registeredKeyError, setRegisteredKeyError] = useState<string | null>(null);
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
    if (!address) return;
    const p = loadProfile(address);
    setProfile(p);
    setHandleInput(p.handle ?? '');
    setKeyLabelInput((p.keyLabel ?? '').slice(0, 15));
  }, [address]);

  useEffect(() => {
    if (!address) {
      setRegisteredKeyRecord(null);
      setRegisteredKeyLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setRegisteredKeyLoading(true);
      setRegisteredKeyError(null);
      try {
        const params = new URLSearchParams({ address });
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
          setRegisteredKeyError(message);
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
  }, [address]);

  const handleValid = useMemo(() => {
    const normalized = normalizeHandle(handleInput);
    if (!normalized) return false;
    // basic validation: letters, digits, dashes and dots; start with letter/digit
    const left = normalized.replace(/\.3send$/, '');
    return /^[a-z0-9](?:[a-z0-9-_.]{1,30})?$/.test(left);
  }, [handleInput]);

  const onSaveHandle = useCallback(() => {
    if (!address || !handleValid) return;
    const next: UserProfile = { ...profile, handle: normalizeHandle(handleInput) };
    saveProfile(address, next);
    setProfile(next);
  }, [address, handleValid, handleInput, profile]);

  // Key label is captured when generating or regenerating the pair

  const registerSeedKey = useCallback(
    async (params: { mnemonic: string; fingerprint?: string; label?: string }) => {
      const { mnemonic, fingerprint, label } = params;
      if (!address) {
        throw new Error('Wallet address missing.');
      }
      if (!signMessageAsync) {
        throw new Error('Wallet signer not available. Connect your wallet to continue.');
      }

      setRegisteredKeyBusy(true);
      setRegisteredKeyError(null);
      try {
        const { publicKeyBase64 } = await deriveSeedKeyPair(mnemonic);
        const message = buildRegisteredKeyMessage(address, publicKeyBase64);
        const signature = await signMessageAsync({ message });
        const registerRes = await fetch('/api/keys/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'seed',
            address,
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
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ratio1:registered-key-updated', { detail: { address } })
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to register seed key';
        setRegisteredKeyError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setRegisteredKeyBusy(false);
      }
    },
    [address, signMessageAsync]
  );

  const onGenerateKeys = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    try {
      const label = keyLabelInput.trim().slice(0, 15);
      if (!label) {
        alert('Please enter a label for this key pair (e.g., Laptop key).');
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
      saveProfile(address, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
      await registerSeedKey({ mnemonic: gen.mnemonic, fingerprint: gen.fingerprintHex, label });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate key pair');
    } finally {
      setBusy(false);
    }
  }, [address, profile, keyLabelInput, registerSeedKey]);

  const onRegenerateKeys = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    try {
      const label = keyLabelInput.trim().slice(0, 15);
      if (!label) {
        alert('Please enter a label for this key pair (e.g., Mobile key).');
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
      saveProfile(address, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
      await registerSeedKey({ mnemonic: gen.mnemonic, fingerprint: gen.fingerprintHex, label });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate key pair');
    } finally {
      setBusy(false);
    }
  }, [address, profile, keyLabelInput, registerSeedKey]);

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
        alert(fallbackMessage ?? 'Clipboard not available. Please copy manually.');
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        alert(successMessage);
      } catch {
        alert(fallbackMessage ?? 'Failed to copy. Please copy manually.');
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
      alert('Recovery phrase is not the active encryption method.');
      return;
    }
    const stored = profile.seedMnemonic?.trim();
    if (!stored) {
      alert('No saved recovery phrase found on this device.');
      return;
    }
    setPrivKeyOnce(stored);
  }, [profile.seedMnemonic, registeredKeyRecord]);

  const onRegisterPasskey = useCallback(async () => {
    if (!address) return;
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      alert('Passkeys are not supported in this environment.');
      return;
    }
    if (!window.PublicKeyCredential) {
      alert('Passkeys are not supported by this browser.');
      return;
    }
    if (!signMessageAsync) {
      alert('Wallet signer not available. Connect your wallet to continue.');
      return;
    }

    setRegisteredKeyBusy(true);
    setRegisteredKeyError(null);
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(address.toLowerCase());

      const creationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: '3send',
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: `3send: ${address}`,
          displayName: `3send: ${address}`,
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
      const { publicKey: x25519PublicKey } = await derivePasskeyX25519KeyPair({
        credentialIdB64,
        salt: prfSaltBytes,
      });
      const prfSaltB64 = encodeBase64(prfSaltBytes);
      const message = buildRegisteredKeyMessage(address, x25519PublicKey);
      const signature = await signMessageAsync({ message });

      const registerRes = await fetch('/api/keys/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'passkey',
          address,
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
        saveProfile(address, next);
        return next;
      });
      setKeyLabelInput('');
      hidePrivKeyOnce();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('ratio1:registered-key-updated', { detail: { address } })
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
        alert(message);
      }
    } finally {
      setRegisteredKeyBusy(false);
    }
  }, [address, signMessageAsync, hidePrivKeyOnce]);

  if (!isConnected || !address) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">My Profile</div>
          <div className="subhead">Connect your wallet to manage your handle and keys.</div>
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
        <div className="muted" style={{ fontSize: 12 }}>
          Connected as{' '}
          <span className="mono" style={{ color: 'var(--accent)' }}>
            {shortAddress(address, 5)}
          </span>
        </div>
      </div>

      <HandleSection
        handleInput={handleInput}
        onHandleChange={setHandleInput}
        onSaveHandle={onSaveHandle}
        handleValid={handleValid}
        currentHandle={profile.handle}
      />

      <EncryptionModesSection
        activeMode={registeredKeyRecord ? 'pro' : 'light'}
        activeMethod={registeredKeyRecord?.type ?? null}
        registeredKeyRecord={registeredKeyRecord}
        registeredKeyLoading={registeredKeyLoading}
        registeredKeyError={registeredKeyError}
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
        onRevealStoredSeed={revealStoredSeed}
        isRecoveryPhraseVisible={registeredKeyRecord?.type === 'seed' && Boolean(privKeyOnce)}
        onHideRecoveryPhrase={hidePrivKeyOnce}
      />
    </main>
  );
}
