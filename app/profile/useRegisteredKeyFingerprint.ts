import { decodeBase64 } from '@/lib/encryption';
import type { RegisteredKeyRecord } from '@/lib/types';
import { useEffect, useState } from 'react';

function bytesToHex(input: ArrayBuffer | Uint8Array): string {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Array.from(view)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function useRegisteredKeyFingerprint(record: RegisteredKeyRecord | null): string | null {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const assign = (value: string | null) => {
      if (!cancelled) {
        setFingerprint(value);
      }
    };

    if (!record) {
      assign(null);
      return () => {
        cancelled = true;
      };
    }

    if (record.type === 'seed' && record.fingerprint) {
      assign(record.fingerprint);
      return () => {
        cancelled = true;
      };
    }

    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      assign(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const publicKeyBytes = decodeBase64(record.publicKey);
        const buffer = publicKeyBytes.buffer.slice(
          publicKeyBytes.byteOffset,
          publicKeyBytes.byteOffset + publicKeyBytes.byteLength
        ) as ArrayBuffer;
        const digest = await window.crypto.subtle.digest('SHA-256', buffer);
        assign(bytesToHex(digest).slice(0, 40));
      } catch (error) {
        console.warn('[profile] Failed to derive key fingerprint', error);
        assign(null);
      }
    })().catch(() => {
      assign(null);
    });

    return () => {
      cancelled = true;
    };
  }, [record]);

  return fingerprint;
}
