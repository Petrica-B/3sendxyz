import type {
  RegisteredKeyRecord,
  RegisteredPasskeyRecord,
  RegisteredSeedRecord,
  UserProfile,
} from '@/lib/types';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';

type SetupMethod = 'passkey' | 'seed';
export type PasskeyRegistrationStep =
  | 'prompt-device'
  | 'derive-key'
  | 'sign-wallet'
  | 'register-server';

type EncryptionModesSectionProps = {
  activeMode: 'light' | 'pro';
  activeMethod: RegisteredKeyRecord['type'] | null;
  registeredKeyRecord: RegisteredKeyRecord | null;
  registeredKeyLoading: boolean;
  registeredKeyFingerprint: string | null;
  passkeySupported: boolean;
  passkeyBusy: boolean;
  passkeyRecord: RegisteredPasskeyRecord | null;
  passkeyCredentialPreview: string | null;
  seedKeyRecord: RegisteredSeedRecord | null;
  profile: UserProfile;
  keyLabelInput: string;
  onKeyLabelChange: (value: string) => void;
  onGenerateSeed: () => Promise<void> | void;
  onRegenerateSeed: () => Promise<void> | void;
  onRegisterPasskey: (
    onStatusChange?: (step: PasskeyRegistrationStep) => void
  ) => Promise<void> | void;
  privKeyOnce: string | null;
  copyPrivateKey: () => Promise<void> | void;
  downloadPrivateKey: () => void;
  copyToClipboard: (value: string, successMessage: string, fallbackMessage?: string) => void;
  hasStoredSeed: boolean;
  needsSeedRecovery: boolean;
  onRevealStoredSeed: () => void;
  onRecoverSeed: (mnemonic: string) => Promise<void> | void;
  isRecoveryPhraseVisible: boolean;
  onHideRecoveryPhrase: () => void;
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
};

export default function EncryptionModesSection(props: EncryptionModesSectionProps) {
  const {
    activeMode,
    activeMethod,
    registeredKeyRecord,
    registeredKeyLoading,
    registeredKeyFingerprint,
    passkeySupported,
    passkeyBusy,
    passkeyRecord,
    passkeyCredentialPreview,
    seedKeyRecord,
    profile,
    keyLabelInput,
    onKeyLabelChange,
    onGenerateSeed,
    onRegenerateSeed,
    onRegisterPasskey,
    privKeyOnce,
    copyPrivateKey,
    downloadPrivateKey,
    copyToClipboard,
    hasStoredSeed,
    needsSeedRecovery,
    onRevealStoredSeed,
    onRecoverSeed,
    isRecoveryPhraseVisible,
    onHideRecoveryPhrase,
  } = props;

  const isPasskeyActive = activeMethod === 'passkey';
  const isSeedActive = activeMethod === 'seed';
  const [pendingSetup, setPendingSetup] = useState<SetupMethod | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [recoverModalOpen, setRecoverModalOpen] = useState(false);
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState('');
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyRegistrationStep | null>(null);

  const shouldPromptSeedRecovery = isSeedActive && needsSeedRecovery;

  useEffect(() => {
    if (!shouldPromptSeedRecovery) {
      setRecoverModalOpen(false);
      setRecoveryPhraseInput('');
      setRecoverError(null);
    }
  }, [shouldPromptSeedRecovery]);

  useEffect(() => {
    if (pendingSetup !== 'passkey') {
      setPasskeyStatus(null);
    }
  }, [pendingSetup]);

  const passkeyButtonLabel = isPasskeyActive
    ? 'Replace'
    : activeMethod === null
      ? 'Set up passkey'
      : 'Switch to passkey';
  const seedButtonLabel = isSeedActive
    ? 'Replace'
    : activeMethod === null
      ? 'Set up recovery phrase'
      : 'Switch to recovery phrase';

  const modalTitle = useMemo(() => {
    if (!pendingSetup) return '';
    return pendingSetup === 'passkey' ? 'Secure with a passkey' : 'Secure with a recovery phrase';
  }, [pendingSetup]);

  const modalDescription = useMemo(() => {
    if (!pendingSetup) return '';
    const descriptionBegin =
      activeMethod !== null
        ? 'You will replace your current key. All the files already received will not be unlockable anymore.\n'
        : 'Set up your new encryption key.';

    if (pendingSetup === 'passkey') {
      return passkeySupported
        ? `${descriptionBegin}Use Face ID, Touch ID, or a device passkey. We only store the public key.`
        : 'Your browser does not support passkeys. Please switch to Safari, Chrome, or Edge on a compatible device.';
    }
    return `${descriptionBegin}Generate a 24-word phrase. Store it offline: 3send never keeps a copy.`;
  }, [pendingSetup, passkeySupported, activeMethod]);

  const handleSetup = async () => {
    if (!pendingSetup) return;
    if (pendingSetup === 'passkey' && !passkeySupported) {
      setModalError('Passkeys are not supported in this browser.');
      toast.error('Passkeys are not supported in this browser.');
      return;
    }
    if (pendingSetup === 'seed') {
      const trimmed = keyLabelInput.trim();
      if (!trimmed) {
        setModalError('Add a short label so you remember which device this phrase belongs to.');
        toast.error('Add a short label so you remember which device this phrase belongs to.');
        return;
      }
    }
    setModalError(null);
    setModalBusy(true);
    try {
      if (pendingSetup === 'passkey') {
        setPasskeyStatus('prompt-device');
        await onRegisterPasskey((step) => setPasskeyStatus(step));
      } else if (isSeedActive) {
        await onRegenerateSeed();
      } else {
        await onGenerateSeed();
      }
      setPendingSetup(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong while configuring the key.';
      setModalError(message);
      toast.error(message ?? 'Something went wrong while configuring the key.', {
        toastId: 'profile-modal-error',
      });
    } finally {
      setModalBusy(false);
      setPasskeyStatus(null);
    }
  };

  const closeModal = () => {
    if (modalBusy) return;
    setModalError(null);
    setPendingSetup(null);
    setPasskeyStatus(null);
  };

  const openRecoverModal = () => {
    setRecoveryPhraseInput('');
    setRecoverError(null);
    setRecoverModalOpen(true);
  };

  const closeRecoverModal = () => {
    if (recoverBusy) return;
    setRecoverModalOpen(false);
    setRecoverError(null);
    setRecoveryPhraseInput('');
  };

  const handleRecoverSeed = async () => {
    const trimmed = recoveryPhraseInput.trim();
    if (!trimmed) {
      setRecoverError('Enter your 24-word recovery phrase to continue.');
      toast.error('Enter your 24-word recovery phrase to continue.');
      return;
    }
    const words = trimmed.split(/\s+/);
    if (words.length !== 24) {
      setRecoverError('Recovery phrase must contain exactly 24 words.');
      toast.error('Recovery phrase must contain exactly 24 words.');
      return;
    }
    setRecoverError(null);
    setRecoverBusy(true);
    try {
      const normalized = words.map((word) => word.toLowerCase()).join(' ');
      await onRecoverSeed(normalized);
      setRecoverModalOpen(false);
      setRecoveryPhraseInput('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to import the recovery phrase.';
      setRecoverError(message);
      toast.error(message ?? 'Failed to import the recovery phrase.');
    } finally {
      setRecoverBusy(false);
    }
  };

  const handleRevealStoredSeed = () => {
    if (!isSeedActive || !hasStoredSeed || isRecoveryPhraseVisible) return;
    const confirmReveal =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Reveal your saved recovery phrase on this screen? Anyone nearby will be able to read it.'
          );
    if (!confirmReveal) return;
    onRevealStoredSeed();
  };

  const revealButtonLabel = isRecoveryPhraseVisible
    ? 'Recovery phrase visible'
    : 'Reveal active recovery phrase';

  return (
    <section className="card col" style={{ gap: 16 }}>
      <div style={{ fontWeight: 700 }}>Privacy &amp; Encryption</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Decide how 3send protects files arriving in your inbox. Light Mode keeps an encrypted backup
        so you never lose access. Pro Mode keeps the private key in your hands only.
      </div>

      <div
        className="col"
        style={{
          gap: 8,
          padding: 12,
          borderRadius: 8,
          background: 'var(--panel)',
        }}
      >
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <div className="col" style={{ gap: 4 }}>
            <div style={{ fontWeight: 600 }}>Light Mode</div>
            <div className="muted" style={{ fontSize: 12 }}>
              3send stores an encrypted copy of your key so any connected device can read your
              files.
            </div>
          </div>
          <span
            className="pill"
            style={{
              fontWeight: 600,
              background: activeMode === 'light' ? '#fff7ed' : '#fff',
              borderColor: activeMode === 'light' ? 'var(--accent)' : 'var(--border)',
              color: activeMode === 'light' ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {activeMode === 'light' ? 'Active' : 'Not active'}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Great for convenience—you can switch to Pro Mode whenever privacy becomes the priority.
        </div>
      </div>

      {registeredKeyLoading && (
        <div className="muted" style={{ fontSize: 12 }}>
          Checking your encryption settings…
        </div>
      )}

      <div style={gridStyle}>
        <EncryptionOptionCard
          title="Passkey (recommended)"
          description="Secure hardware-backed keys unlocked with Face ID, Touch ID, or your device PIN."
          badge={isPasskeyActive ? 'Active' : undefined}
          actionLabel={passkeyButtonLabel}
          disabled={passkeyBusy || (!passkeySupported && activeMethod !== 'passkey')}
          onClick={() => setPendingSetup('passkey')}
          icon={<PasskeyIcon />}
        />
        <EncryptionOptionCard
          title="Recovery phrase"
          description="A 24-word seed that only you retain. Ideal when you want fully offline control."
          badge={isSeedActive ? 'Active' : undefined}
          actionLabel={seedButtonLabel}
          onClick={() => setPendingSetup('seed')}
          icon={<SeedIcon />}
        />
      </div>

      {activeMode === 'pro' && registeredKeyRecord ? (
        <ActiveKeyDetails
          activeMethod={activeMethod}
          registeredKeyRecord={registeredKeyRecord}
          registeredKeyFingerprint={registeredKeyFingerprint}
          passkeyRecord={passkeyRecord}
          passkeyCredentialPreview={passkeyCredentialPreview}
          seedKeyRecord={seedKeyRecord}
          copyToClipboard={copyToClipboard}
          onReplacePasskey={() => setPendingSetup('passkey')}
          onReplaceSeed={() => setPendingSetup('seed')}
          passkeyBusy={passkeyBusy}
          passkeySupported={passkeySupported}
          keyLabelInput={keyLabelInput}
          onKeyLabelChange={onKeyLabelChange}
          profile={profile}
        />
      ) : (
        <div
          className="col"
          style={{
            gap: 12,
            padding: 12,
            borderRadius: 8,
            background: 'var(--panel)',
          }}
        >
          <div style={{ fontWeight: 600 }}>Ready for Pro Mode?</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Pick a method above to finish the setup. We recommend passkeys for the smoothest
            experience. Recovery phrases offer the same privacy, with a little more self-custody
            effort.
          </div>
        </div>
      )}

      {shouldPromptSeedRecovery && (
        <div
          className="col"
          style={{
            gap: 8,
            padding: 12,
            borderRadius: 8,
            background: 'var(--panel)',
          }}
        >
          <div style={{ fontWeight: 600 }}>Recover your phrase on this device</div>
          <div className="muted" style={{ fontSize: 12 }}>
            This profile uses a recovery phrase, but it is not stored locally. Enter the 24 words so
            3send can decrypt files on this device.
          </div>
          <button className="button" onClick={openRecoverModal} disabled={recoverBusy}>
            Enter recovery phrase
          </button>
        </div>
      )}

      {isSeedActive && hasStoredSeed && (
        <button
          className="button secondary"
          onClick={handleRevealStoredSeed}
          disabled={isRecoveryPhraseVisible}
        >
          {revealButtonLabel}
        </button>
      )}

      {privKeyOnce && (
        <RecoveryPhraseReveal
          privKeyOnce={privKeyOnce}
          copyPrivateKey={copyPrivateKey}
          downloadPrivateKey={downloadPrivateKey}
          onClose={onHideRecoveryPhrase}
        />
      )}

      {recoverModalOpen && (
        <RecoverSeedModal
          value={recoveryPhraseInput}
          onChange={(value) => setRecoveryPhraseInput(value)}
          onClose={closeRecoverModal}
          onConfirm={handleRecoverSeed}
          busy={recoverBusy}
          error={recoverError}
        />
      )}

      {pendingSetup && (
        <SetupModal
          title={modalTitle}
          description={modalDescription}
          method={pendingSetup}
          keyLabelInput={keyLabelInput}
          onKeyLabelChange={onKeyLabelChange}
          onClose={closeModal}
          onContinue={handleSetup}
          busy={modalBusy}
          error={modalError}
          passkeyStatus={pendingSetup === 'passkey' ? passkeyStatus : null}
        />
      )}
    </section>
  );
}

type EncryptionOptionCardProps = {
  title: string;
  description: string;
  badge?: string;
  actionLabel: string;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
};

function EncryptionOptionCard(props: EncryptionOptionCardProps) {
  const { title, description, badge, actionLabel, onClick, disabled, icon } = props;
  return (
    <div
      className="col"
      style={{
        gap: 14,
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
        background: '#fff',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span>{icon}</span>
          <div style={{ fontWeight: 600 }}>{title}</div>
        </div>
        {badge && (
          <span className="pill" style={{ fontWeight: 600 }}>
            {badge}
          </span>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {description}
      </div>
      <button className="button" onClick={onClick} disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}

type ActiveKeyDetailsProps = {
  activeMethod: RegisteredKeyRecord['type'] | null;
  registeredKeyRecord: RegisteredKeyRecord;
  registeredKeyFingerprint: string | null;
  passkeyRecord: RegisteredPasskeyRecord | null;
  passkeyCredentialPreview: string | null;
  seedKeyRecord: RegisteredSeedRecord | null;
  copyToClipboard: (value: string, successMessage: string, fallbackMessage?: string) => void;
  onReplacePasskey: () => void;
  onReplaceSeed: () => void;
  passkeyBusy: boolean;
  passkeySupported: boolean;
  keyLabelInput: string;
  onKeyLabelChange: (value: string) => void;
  profile: UserProfile;
};

function ActiveKeyDetails(props: ActiveKeyDetailsProps) {
  const {
    activeMethod,
    registeredKeyRecord,
    registeredKeyFingerprint,
    passkeyRecord,
    passkeyCredentialPreview,
    seedKeyRecord,
    copyToClipboard,
    onReplacePasskey,
    onReplaceSeed,
    passkeyBusy,
    passkeySupported,
    keyLabelInput,
    onKeyLabelChange,
    profile,
  } = props;

  return (
    <div
      className="col"
      style={{
        gap: 12,
        padding: 12,
        borderRadius: 8,
        background: 'var(--panel)',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4 }}>
          <div style={{ fontWeight: 600 }}>Pro Mode active</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Only you hold the private key. No one, including 3send, can decrypt files on your
            behalf.
          </div>
        </div>
        <span
          className="pill"
          style={{
            fontWeight: 600,
            background: '#e0f2fe',
            borderColor: '#38bdf8',
            color: '#0369a1',
          }}
        >
          Active
        </span>
      </div>

      <div className="muted" style={{ fontSize: 12 }}>
        Secured with{' '}
        {activeMethod === 'passkey'
          ? 'a hardware-backed passkey managed by your device.'
          : 'a 24-word recovery phrase that only you control.'}
      </div>

      {registeredKeyFingerprint && (
        <CopyRow
          label="Fingerprint"
          value={registeredKeyFingerprint}
          copyToClipboard={() =>
            copyToClipboard(registeredKeyFingerprint, 'Key fingerprint copied to clipboard.')
          }
          mono
        />
      )}

      <CopyRow
        label="Public key"
        value={registeredKeyRecord.publicKey}
        copyToClipboard={() =>
          copyToClipboard(registeredKeyRecord.publicKey, 'Public key copied to clipboard.')
        }
        mono
      />

      {passkeyRecord && (
        <>
          {passkeyRecord.credentialId && (
            <CopyRow
              label="Credential ID"
              value={passkeyRecord.credentialId}
              displayValue={passkeyCredentialPreview ?? passkeyRecord.credentialId}
              copyToClipboard={() =>
                copyToClipboard(passkeyRecord.credentialId, 'Passkey credential ID copied.')
              }
              mono
            />
          )}
          <div className="muted mono" style={{ fontSize: 12 }}>
            PRF salt: {passkeyRecord.prfSalt.slice(0, 16)}…
          </div>
          {typeof passkeyRecord.algorithm === 'number' && (
            <div className="muted mono" style={{ fontSize: 12 }}>
              COSE algorithm: {passkeyRecord.algorithm}
            </div>
          )}
        </>
      )}

      {seedKeyRecord?.derivationPath && (
        <div className="muted mono" style={{ fontSize: 12 }}>
          Derivation path: {seedKeyRecord.derivationPath}
        </div>
      )}

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

      <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>
        Replacing this key means files encrypted for the previous key stay locked unless you saved
        that key material.
      </div>
    </div>
  );
}

type CopyRowProps = {
  label: string;
  value: string;
  displayValue?: string;
  copyToClipboard: () => void;
  mono?: boolean;
};

function CopyRow(props: CopyRowProps) {
  const { label, value, displayValue, copyToClipboard, mono } = props;
  const preview = displayValue ?? `${value.slice(0, 16)}${value.length > 16 ? '…' : ''}`;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}:
      </div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: 12 }}>
        {preview}
      </div>
      <button
        className="button secondary"
        style={{
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 32,
          minHeight: 32,
        }}
        onClick={copyToClipboard}
        aria-label="Copy value"
        title="Copy value"
      >
        <ClipboardIcon />
      </button>
    </div>
  );
}

type SetupModalProps = {
  title: string;
  description: string;
  method: SetupMethod;
  keyLabelInput: string;
  onKeyLabelChange: (value: string) => void;
  onClose: () => void;
  onContinue: () => void;
  busy: boolean;
  error: string | null;
  passkeyStatus: PasskeyRegistrationStep | null;
};

function SetupModal(props: SetupModalProps) {
  const {
    title,
    description,
    method,
    keyLabelInput,
    onKeyLabelChange,
    onClose,
    onContinue,
    busy,
    error,
    passkeyStatus,
  } = props;

  let primaryButtonLabel: string;
  if (!busy) {
    primaryButtonLabel = method === 'passkey' ? 'Start passkey registration' : 'Continue';
  } else if (method !== 'passkey') {
    primaryButtonLabel = 'Please wait…';
  } else {
    switch (passkeyStatus) {
      case 'prompt-device':
        primaryButtonLabel = 'Confirm on your device…';
        break;
      case 'derive-key':
        primaryButtonLabel = 'Deriving encryption key…';
        break;
      case 'sign-wallet':
        primaryButtonLabel = 'Confirm account access…';
        break;
      case 'register-server':
        primaryButtonLabel = 'Saving passkey…';
        break;
      default:
        primaryButtonLabel = 'Registering passkey…';
        break;
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        className="card col"
        style={{
          gap: 12,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          {description}
        </div>
        {method === 'seed' && (
          <div className="col" style={{ gap: 8 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              Device label (max 15 characters)
            </label>
            <input
              className="input"
              placeholder="e.g. Laptop key"
              value={keyLabelInput}
              onChange={(event) => onKeyLabelChange(event.target.value.slice(0, 15))}
              maxLength={15}
            />
          </div>
        )}
        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="button secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button" onClick={onContinue} disabled={busy}>
            {primaryButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type RecoverSeedModalProps = {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
};

function RecoverSeedModal(props: RecoverSeedModalProps) {
  const { value, onChange, onClose, onConfirm, busy, error } = props;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        className="card col"
        style={{
          gap: 12,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18 }}>Restore recovery phrase</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          Paste or type the 24 words assigned to this profile. We only keep a copy in your
          browser&apos;s local storage.
        </div>
        <textarea
          className="input mono"
          rows={4}
          placeholder="24 words separated by spaces"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={busy}
          style={{ fontSize: 12 }}
        />
        <div className="muted" style={{ fontSize: 12 }}>
          We validate it against the registered public key before saving anything locally.
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="button secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Recovering…' : 'Save phrase'}
          </button>
        </div>
      </div>
    </div>
  );
}

type RecoveryPhraseRevealProps = {
  privKeyOnce: string;
  copyPrivateKey: () => Promise<void> | void;
  downloadPrivateKey: () => void;
  onClose?: () => void;
};

function RecoveryPhraseReveal(props: RecoveryPhraseRevealProps) {
  const { privKeyOnce, copyPrivateKey, downloadPrivateKey, onClose } = props;

  return (
    <div
      className="col"
      style={{
        gap: 8,
        marginTop: 4,
        border: '1px solid #f59e0b',
        borderRadius: 8,
        padding: 12,
        background: '#fffbeb',
      }}
    >
      <div style={{ color: '#92400e', fontSize: 12, fontWeight: 700 }}>
        Save this 24-word recovery phrase now. It cannot be recovered by anyone, including 3send.
      </div>
      <textarea
        readOnly
        className="input mono"
        rows={8}
        value={privKeyOnce}
        style={{ whiteSpace: 'pre', fontSize: 12, background: '#fff' }}
      />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          className="button"
          onClick={copyPrivateKey}
          aria-label="Copy recovery phrase"
          title="Copy recovery phrase"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <ClipboardIcon />
        </button>
        <button className="button secondary" onClick={downloadPrivateKey}>
          Download recovery phrase
        </button>
        {onClose && (
          <button className="button secondary" onClick={onClose}>
            Hide phrase
          </button>
        )}
      </div>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15.75 5.25h2.25a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5.25h2.25"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.75 3.75a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v0.75h-4.5V3.75Z"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="9.75"
        y="3.75"
        width="4.5"
        height="1.5"
        rx="0.75"
        fill="#0f172a"
        fillOpacity="0.75"
      />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Modern vertical key (thicker) */}
      {/* Bow */}
      <circle cx="12" cy="7" r="3.2" stroke="#0f172a" strokeOpacity="0.85" strokeWidth="2" />
      {/* Bow hole */}
      <circle cx="12" cy="7" r="1.2" fill="#0f172a" fillOpacity="0.85" />
      {/* Shaft */}
      <path d="M12 10.5V18.5" stroke="#0f172a" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
      {/* Teeth */}
      <path d="M12 15h3" stroke="#0f172a" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17h2.2" stroke="#0f172a" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SeedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h8l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 3v5h5"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M9 16h6"
        stroke="#0f172a"
        strokeOpacity="0.75"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
