'use client';

import { shortAddress } from '@/lib/format';
import { generateMnemonicKeyPair } from '@/lib/keys';
import { buildPasskeyRegisterMessage } from '@/lib/passkeyAccess';
import type { PasskeyRecord, UserProfile } from '@/lib/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

function loadProfile(addr: string): UserProfile {
  try {
    const raw = localStorage.getItem(`profile:${addr.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as UserProfile) : {};
  } catch {
    return {};
  }
}

function saveProfile(addr: string, data: UserProfile) {
  try {
    localStorage.setItem(`profile:${addr.toLowerCase()}`, JSON.stringify(data));
  } catch {}
}

function normalizeHandle(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  const withSuffix = trimmed.endsWith('.3send') ? trimmed : `${trimmed}.3send`;
  return withSuffix;
}

type AttestationResponseWithPublicKey = AuthenticatorAttestationResponse & {
  getPublicKey?: () => ArrayBuffer | null;
  getPublicKeyAlgorithm?: () => number | null;
};

type PasskeyCredential = PublicKeyCredential & {
  response: AttestationResponseWithPublicKey;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState<UserProfile>({});
  const [handleInput, setHandleInput] = useState('');
  const [keyLabelInput, setKeyLabelInput] = useState('');
  const [privKeyOnce, setPrivKeyOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyRecord, setPasskeyRecord] = useState<PasskeyRecord | null>(null);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

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
    setKeyLabelInput(p.keyLabel ?? '');
  }, [address]);

  useEffect(() => {
    if (!address) {
      setPasskeyRecord(null);
      setPasskeyLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setPasskeyLoading(true);
      setPasskeyError(null);
      try {
        const params = new URLSearchParams({ address });
        const res = await fetch(`/api/passkeys/status?${params.toString()}`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error || 'Failed to fetch passkey status');
        }
        if (!cancelled) {
          setPasskeyRecord(payload.record ?? null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (!cancelled) {
          setPasskeyRecord(null);
          setPasskeyError(message);
        }
      } finally {
        if (!cancelled) {
          setPasskeyLoading(false);
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

  const onGenerateKeys = useCallback(async () => {
    if (!address) return;
    const confirmed = window.confirm(
      'Generate a new key pair? You will receive a 12‑word private key phrase. Store it securely — we do not keep a copy.'
    );
    if (!confirmed) return;
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
      };
      saveProfile(address, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate key pair');
    } finally {
      setBusy(false);
    }
  }, [address, profile, keyLabelInput]);

  const onRegenerateKeys = useCallback(async () => {
    if (!address) return;
    const confirmed = window.confirm(
      'Regenerate key pair? If you forget the new 12‑word private key, you will not be able to decrypt future files. Old files encrypted to the previous key may be unrecoverable.'
    );
    if (!confirmed) return;
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
      };
      saveProfile(address, next);
      setProfile(next);
      setPrivKeyOnce(gen.mnemonic);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate key pair');
    } finally {
      setBusy(false);
    }
  }, [address, profile, keyLabelInput]);

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

  const copyPrivateKey = useCallback(async () => {
    if (!privKeyOnce) return;
    try {
      await navigator.clipboard.writeText(privKeyOnce);
      alert('Private key phrase copied. Store it securely.');
    } catch {
      alert('Failed to copy. Please select and copy manually.');
    }
  }, [privKeyOnce]);

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

    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const message = buildPasskeyRegisterMessage(address);
      const signature = await signMessageAsync({ message });

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
          name: address,
          displayName: `3send ${address}`,
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
      const publicKeyBuffer =
        typeof attestationResponse.getPublicKey === 'function'
          ? attestationResponse.getPublicKey()
          : null;
      if (!publicKeyBuffer) {
        throw new Error('Authenticator did not return a public key.');
      }

      const algorithm =
        typeof attestationResponse.getPublicKeyAlgorithm === 'function'
          ? attestationResponse.getPublicKeyAlgorithm()
          : undefined;

      const credentialIdB64 = arrayBufferToBase64(credential.rawId);
      const publicKeyB64 = arrayBufferToBase64(publicKeyBuffer);

      const registerRes = await fetch('/api/passkeys/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          signature,
          message,
          credentialId: credentialIdB64,
          publicKey: publicKeyB64,
          algorithm,
        }),
      });
      const payload = await registerRes.json().catch(() => null);
      if (!registerRes.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to register passkey');
      }
      setPasskeyRecord(payload.record ?? null);
      setPasskeyError(null);
    } catch (err) {
      let message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      if (
        err instanceof DOMException &&
        (err.name === 'AbortError' || err.name === 'NotAllowedError')
      ) {
        message = 'Passkey registration was cancelled.';
      }
      setPasskeyError(message);
      console.error('[passkeys] register failed', err);
      if (message && !/cancel/i.test(message) && !/not allowed/i.test(message)) {
        alert(message);
      }
    } finally {
      setPasskeyBusy(false);
    }
  }, [address, signMessageAsync]);

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

      <section className="card col" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Handle</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Choose a public handle to share, like <span className="mono">alice.3send</span>.
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="yourname.3send"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="button" onClick={onSaveHandle} disabled={!handleValid}>
            Save Handle
          </button>
        </div>
        {!handleValid && handleInput && (
          <div style={{ color: '#f87171', fontSize: 12 }}>Invalid handle format.</div>
        )}
        {profile.handle && (
          <div className="muted" style={{ fontSize: 12 }}>
            Current: <span className="mono">{profile.handle}</span>
          </div>
        )}
      </section>

      <section className="card col" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Encryption Keys</div>
        <div className="muted" style={{ fontSize: 12 }}>
          We generate a key pair in your browser and provide you with a 12-word private key phrase.
          We never store your private key. If you lose it, you will not be able to decrypt any files
          that were encrypted using your old private key.
        </div>
        {/* Key label input is placed next to the action button below */}
        {profile.fingerprintHex ? (
          <div className="col" style={{ gap: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Key fingerprint:
              <span className="mono" style={{ marginLeft: 6 }}>
                {profile.fingerprintHex?.slice(0, 16)}…
              </span>
            </div>
            {profile.keyLabel && (
              <div className="muted" style={{ fontSize: 12 }}>
                Label: <span className="mono">{profile.keyLabel}</span>
              </div>
            )}
            {profile.keyCreatedAt && (
              <div className="muted" style={{ fontSize: 12 }}>
                Created: {new Date(profile.keyCreatedAt).toLocaleString()}
              </div>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
              <input
                className="input"
                placeholder="e.g. Laptop key (max 15 chars)"
                value={keyLabelInput}
                onChange={(e) => setKeyLabelInput(e.target.value.slice(0, 15))}
                style={{ flex: 1, minWidth: 220 }}
                maxLength={15}
              />
              <button className="button" onClick={onRegenerateKeys} disabled={busy}>
                Regenerate Key Pair
              </button>
            </div>
          </div>
        ) : (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <input
              className="input"
              placeholder="e.g. Laptop key (max 15 chars)"
              value={keyLabelInput}
              onChange={(e) => setKeyLabelInput(e.target.value.slice(0, 15))}
              style={{ flex: 1, minWidth: 220 }}
              maxLength={15}
            />
            <button className="button" onClick={onGenerateKeys} disabled={busy}>
              Generate Key Pair
            </button>
          </div>
        )}

        {privKeyOnce && (
          <div className="col" style={{ gap: 8 }}>
            <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700 }}>
              Important: Save your 12‑word private key phrase now. We cannot recover it.
            </div>
            <textarea
              readOnly
              className="input mono"
              rows={8}
              value={privKeyOnce}
              style={{ whiteSpace: 'pre', fontSize: 12 }}
            />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="button" onClick={copyPrivateKey}>
                Copy Private Key
              </button>
              <button className="button secondary" onClick={downloadPrivateKey}>
                Download Private Key
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card col" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Passkey Encryption</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Register a passkey so encrypted file delivery can rely on hardware-backed keys stored on
          your device. Only the public key is shared with 3send; the private key remains protected
          by your passkey provider.
        </div>
        {!passkeySupported && (
          <div style={{ color: '#f87171', fontSize: 12 }}>
            Passkeys are not supported in this browser. Try Safari, Chrome, or Edge on a device with
            passkey support.
          </div>
        )}
        {passkeyLoading && (
          <div className="muted" style={{ fontSize: 12 }}>
            Checking passkey status…
          </div>
        )}
        {passkeyError && !passkeyLoading && (
          <div style={{ color: '#f87171', fontSize: 12 }}>{passkeyError}</div>
        )}
        {!passkeyLoading && passkeyRecord && (
          <div className="col" style={{ gap: 6 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Passkey registered on {new Date(passkeyRecord.createdAt).toLocaleString()}.
            </div>
            {passkeyCredentialPreview && (
              <div className="muted mono" style={{ fontSize: 12 }}>
                Credential ID: {passkeyCredentialPreview}
              </div>
            )}
            {typeof passkeyRecord.algorithm === 'number' && (
              <div className="muted mono" style={{ fontSize: 12 }}>
                COSE algorithm: {passkeyRecord.algorithm}
              </div>
            )}
          </div>
        )}
        {!passkeyLoading && !passkeyRecord && passkeySupported && (
          <div className="muted" style={{ fontSize: 12 }}>
            No passkey registered yet. Use the button below to store a passkey public key for your
            wallet address.
          </div>
        )}
        <button
          className="button"
          onClick={onRegisterPasskey}
          disabled={passkeyBusy || !passkeySupported}
        >
          {passkeyRecord ? 'Replace Passkey' : 'Register Passkey'}
        </button>
      </section>
    </main>
  );
}
