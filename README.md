**3send.xyz — P2P File Send (Mock)**

- Next.js app scaffolded with Base-style wallet connect (RainbowKit + wagmi + viem)
- Mock file-sending flow using a placeholder "ratio1" protocol stub
- Everything happens client-side; no backend and no real transport yet

**Run Locally**

- Prereqs: Node 18+, npm or pnpm
- Copy env and set WalletConnect project id:
  - `cp .env.example .env.local`
  - Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to your WC Cloud id
- Install deps: `npm install`
- Dev server: `npm run dev`
- Open: http://localhost:3000

**What’s Implemented**

- Wallet connect (Base, Base Sepolia) using RainbowKit/wagmi
- Pages: Outbox (send), Inbox (download)
- UI to select recipient address, pick a file, and add an optional note
- Handshake mock: requests a message signature from the sender to derive a symmetric AES-GCM key (in-browser only)
- Client-side encryption of the selected file into a mock packet and a fake "send" step
- Recent transfers list shows status updates (pending → encrypting → sent)
- Auto-seeded demo items: The first time you open Outbox/Inbox when connected, mock entries are created for easy testing

**What’s Not Implemented (yet)**

- Actual ratio1 transport (p2p signaling, relay, NAT traversal)
- Decryption and receive flow UI
- On-chain actions (e.g., posting session commitments or payment hooks)

**Project Structure**

- `app/` — Next.js App Router pages
- `components/` — UI components (Providers, WalletBar, SendFileCard)
- `lib/ratio1.ts` — mock protocol stubs (session key derivation, AES-GCM encryption)
- `lib/store.ts` — client-side store for Outbox/Inbox (localStorage + in-memory packets)
- `lib/mock.ts` — seeding helper to create demo Inbox/Outbox entries
- `app/outbox/page.tsx` — send files and see sent list
- `app/inbox/page.tsx` — see incoming files, expiration, and download

**Notes on ratio1**

This repo includes a front-end only mock of the ratio1 protocol to help visualize the UX. The mock derives a symmetric key from a signed handshake message and encrypts the file locally. In a production implementation, ratio1 should specify:

- Identity and handshake (ECDH/DID, mutual auth, replay protection)
- Session key derivation (KDF, context binding, forward secrecy)
- Transport (p2p signaling, QUIC/WebRTC, chunking, retries)
- Framing (packet structure, metadata encryption, AAD)
- Key rotation and teardown

If you share the ratio1 spec, we can wire the real primitives next.
