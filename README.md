# 3send.xyz — Wallet-to-wallet file transfer on Base

3send is a Next.js App Router dApp that lets any Base wallet pay a burn fee, encrypt a file locally, and deliver it to another wallet’s inbox over Ratio1 edge services. Every transfer is protected end-to-end: encryption happens in the browser, the 3send Manager contract validates payment, and the encrypted payload lives on Ratio1 R1FS while metadata is tracked in CStore.

## Current capabilities

- RainbowKit/wagmi wallet connection locked to Base Sepolia by default (`components/Providers.tsx`) with automatic chain guards in the send flow.
- Multi-asset payments (R1, USDC, ETH) handled in `components/SendFileCard.tsx`, including allowance management, automated swaps, and burn verification against the Manager contract ABI in `lib/SmartContracts.ts`.
- Client-side X25519 + AES-GCM encryption for files and optional notes (`lib/encryption.ts`) with deterministic handshake messages assembled in `lib/handshake.ts`.
- Key management that supports vault-managed keys, WebAuthn passkeys, and recovery phrases; APIs live under `app/api/keys/*` and `app/api/vault/*`, while UI controls ship from `app/profile/page.tsx`.
- Inbox and outbox pages backed by Ratio1 CStore and R1FS (`app/api/inbox/*`, `app/api/sent/route.ts`, `app/api/send/upload/route.ts`) with in-browser decryption via `app/inbox/page.tsx`.
- Documentation and pricing routes (`app/docs`, `app/pricing`) so the production app and repo stay aligned on feature explanations and tiering.

## How a transfer works

1. **Connect & resolve keys.** Users connect with RainbowKit. The sender resolves the recipient’s X25519 public key through `/api/send/getReceiverPublicKey`, which pulls a registered passkey/seed from CStore or provisions a vault key (`lib/vault.ts`).
2. **Pay & encrypt.** The sender picks a file and preferred asset. `SendFileCard` quotes the Manager contract, confirms balances/allowances, and submits the burn (`transferPayment*` functions). The file is encrypted locally with an ephemeral X25519 exchange and AES-GCM, and the sender signs a handshake (`lib/handshake.ts`) that binds ciphertext lengths, metadata digests, and the payment transaction hash.
3. **Upload & record.** `/api/send/upload` verifies the signed handshake, re-fetches the on-chain receipt, decodes the `PaymentProcessed` event using `Manager3sendAbi`, stores the ciphertext in Ratio1 R1FS, and stores the metadata record in Ratio1 CStore under both the sender and recipient hashes.
4. **Receive & decrypt.** The recipient wallet pulls its inbox from `/api/inbox`, downloads the encrypted payload via `/api/inbox/download`, and decrypts it in the browser using the active key source—vault (`lib/vaultClient.ts`), passkey PRF (`lib/passkeyClient.ts`), or recovery phrase (`lib/keys.ts`). Notes can be decrypted on demand; key-rotation guards prevent mismatched credentials from unlocking older transfers.

## Project layout

- `app/` – Next.js App Router routes (`outbox`, `inbox`, `profile`, `docs`, `pricing`) plus API routes under `app/api`.
  - `app/api/send/upload/route.ts` – validates payment receipts and pushes encrypted files to Ratio1.
  - `app/api/inbox/*` & `app/api/sent/route.ts` – list/download stored transfers from CStore/R1FS.
  - `app/api/keys/*` & `app/api/vault/*` – manage registered keys and vault secrets.
- `components/` – shared UI (wallet providers, send card, pricing CTA, profile controls).
- `lib/` – protocol helpers: encryption, handshake construction, formatting, key derivation, vault crypto, shared types, and ABI exports.
- `public/` – static assets.
- `stubs/` – development shims (e.g., custom `pino-pretty` loader).
- `types/` – shared TypeScript definitions consumed across the app and API layer.

## Environment & configuration

Set these variables in `.env.local` (never commit them):

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` – WalletConnect Cloud project id for RainbowKit.
- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` – GA4 measurement id (e.g., `G-XXXXXXXXXX`) used for site analytics.
- `MINIAPP_ACCOUNT_ASSOCIATION_HEADER` / `MINIAPP_ACCOUNT_ASSOCIATION_PAYLOAD` / `MINIAPP_ACCOUNT_ASSOCIATION_SIGNATURE` – values generated in Base Build once the manifest is live.
- `EE_CHAINSTORE_API_URL` / `CSTORE_API_URL` – Ratio1 CStore endpoint used by `@ratio1/edge-sdk-ts`.
- `EE_R1FS_API_URL` / `R1FS_API_URL` – Ratio1 R1FS endpoint for encrypted payload storage.
- `VAULT_PRIVATE_KEY_SECRET` – server-side secret (≥ 32 chars) used to encrypt vault private keys at rest (`lib/vault.ts`).
- `EE_CHAINSTORE_PEERS` _(optional)_ – JSON array of peer URLs if you need to hydrate the SDK with additional Ratio1 nodes.
- `RPC_URL_BASE` and `RPC_URL_BASE_SEPOLIA` _(optional)_ – override RPC endpoints for the on-chain receipt checks performed in `/api/send/upload`.
- `EE_HOST_ID` _(optional)_ – shows which edge node served the request in `components/ServedByComponent.tsx`.

The Ratio1 SDK also accepts the above variables via `window.__RATIO1_ENV__` when deployed.

## Base mini app integration

- The Farcaster manifest is served from `app/.well-known/farcaster.json/route.ts`. Populate the Base Build `accountAssociation` values in your environment once you verify the domain.
- `components/Providers.tsx` calls `sdk.actions.ready()` from `@farcaster/miniapp-sdk` when the app boots inside the Base app shell to dismiss the loading splash.
- `app/layout.tsx` injects the required `fc:miniapp` metadata so Base renders embeds and the launch button correctly. Update the splash, image, and screenshot URLs via the environment variables above.

## Getting started

1. Install prerequisites: Node 18+ and npm.
2. Create `.env.local` with the variables above (base values for local development are provided in the internal `.env`, but don’t commit secrets).
3. Install dependencies: `npm install`
4. Run the dev server: `npm run dev` (opens http://localhost:3000)
5. Lint before pushing: `npm run lint`

`npm run build` and `npm run start` are available for production smoke tests, but the preferred local validation loop is `npm run lint`.

## Manual QA checklist

- Connect a wallet on Base Sepolia, ensure chain guards prompt if you’re on the wrong network.
- Visit **Profile** to register a passkey or recovery phrase and confirm the status indicator updates.
- Send a file from **Outbox** using each supported asset (R1, USDC, ETH); wait for the burn transaction, sign the handshake, and observe the upload succeed.
- Confirm the entry appears in **Outbox** (sender view) and **Inbox** (recipient view).
- Download the payload from **Inbox** and verify the decrypted file matches the source; decrypt any attached note.
- Rotate your key (passkey → seed or vice versa) and confirm old transfers warn about key mismatch while new transfers still decrypt.

## Additional resources

- Protocol deep-dive lives at `/docs` (rendered from `app/docs/page.tsx`).
- Pricing tiers are defined in `lib/constants.ts` and rendered in `/pricing`.
- Smart contract source of truth: https://github.com/aledefra/3sendxyz-sc (ABI mirror in `lib/SmartContracts.ts`).
