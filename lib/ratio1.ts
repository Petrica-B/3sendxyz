// ratio1 protocol – mock stubs
// NOTE: This is a front-end mock for demo purposes only.

export type Ratio1Session = {
  id: string;
  initiator: string; // sender address
  recipient: string; // recipient address
  key: CryptoKey; // symmetric key for AES-GCM
  keyMaterial: Uint8Array; // mock: raw 32-byte key
  createdAt: number;
  context?: string;
};

export type Ratio1Packet = {
  id: string;
  version: string;
  protocol: 'ratio1';
  sessionId: string;
  sender: string;
  recipient: string;
  iv: string; // base64
  ciphertext: string; // base64
  filename: string;
  size: number;
  note?: string;
  createdAt: number;
  // Mock field so a single client can decrypt: DO NOT USE IN PROD
  keyMaterialB64?: string;
  viaNodes?: string[]; // mock route info
  sendTxHash?: string; // mock: pseudo tx hash for encrypted send
};

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  const d = await crypto.subtle.digest('SHA-256', ab);
  return new Uint8Array(d);
}

export async function createRatio1Session(args: {
  initiator: string;
  recipient: string;
  signature: string; // hex or base64 string from wallet
  context?: string;
}): Promise<Ratio1Session> {
  // In a real protocol: derive a shared secret using X25519/ECDH or a DID-based handshake.
  // For mock: use SHA-256 over signature + participants to derive a 32-byte key and import as AES-GCM key.
  const sigBytes = strToBytes(args.signature);
  const seed = await sha256(
    concatBytes(
      sigBytes,
      strToBytes(args.initiator.toLowerCase()),
      strToBytes(args.recipient.toLowerCase()),
      args.context ? strToBytes(args.context) : new Uint8Array()
    )
  );
  const keyMaterial = seed.slice(0, 32);
  const kmBuf = new ArrayBuffer(keyMaterial.byteLength); new Uint8Array(kmBuf).set(keyMaterial);
  const key = await crypto.subtle.importKey('raw', kmBuf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return {
    id: toHex(seed.slice(0, 16)),
    initiator: args.initiator,
    recipient: args.recipient,
    key,
    keyMaterial,
    context: args.context,
    createdAt: Date.now(),
  };
}

export async function encryptFileToPacket(args: {
  file: File;
  session: Ratio1Session;
  note?: string;
  embedKeyMaterial?: boolean;
  viaNodes?: string[];
}): Promise<Ratio1Packet> {
  const { file, session, note, embedKeyMaterial, viaNodes } = args;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await file.arrayBuffer());
  const aad = strToBytes(`ratio1|${session.id}|${session.initiator}|${session.recipient}`);
  // Ensure WebCrypto receives ArrayBuffer (not ArrayBufferLike) for all BufferSources
  const ivBuf = new ArrayBuffer(iv.byteLength); new Uint8Array(ivBuf).set(iv);
  const aadBuf = new ArrayBuffer(aad.byteLength); new Uint8Array(aadBuf).set(aad);
  const dataBuf = new ArrayBuffer(data.byteLength); new Uint8Array(dataBuf).set(data);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBuf, additionalData: aadBuf }, session.key, dataBuf);
  // mock tx hash derived from iv + first chunk of ciphertext + session id
  const txHashBytes = await sha256(concatBytes(iv, new Uint8Array(ctBuf).slice(0, 64), strToBytes(session.id)));
  const sendTxHash = '0x' + toHex(txHashBytes);
  return {
    id: crypto.randomUUID(),
    version: '0.1-mock',
    protocol: 'ratio1',
    sessionId: session.id,
    sender: session.initiator,
    recipient: session.recipient,
    iv: b64(iv),
    ciphertext: b64(ctBuf),
    filename: file.name,
    size: file.size,
    note,
    createdAt: Date.now(),
    keyMaterialB64: embedKeyMaterial ? b64(session.keyMaterial) : undefined,
    viaNodes: viaNodes && viaNodes.length ? viaNodes : generateNodeAliases(3),
    sendTxHash,
  };
}

export async function decryptPacketToBlob(packet: Ratio1Packet): Promise<Blob> {
  if (!packet.keyMaterialB64) throw new Error('Missing key material (mock).');
  const keyMaterial = fromB64(packet.keyMaterialB64);
  const kmBuf = new ArrayBuffer(keyMaterial.byteLength); new Uint8Array(kmBuf).set(keyMaterial);
  const key = await crypto.subtle.importKey('raw', kmBuf, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const iv = fromB64(packet.iv);
  const aad = strToBytes(`ratio1|${packet.sessionId}|${packet.sender}|${packet.recipient}`);
  const ciphertext = fromB64(packet.ciphertext);
  // Convert to ArrayBuffer for WebCrypto
  const ivBuf = new ArrayBuffer(iv.byteLength); new Uint8Array(ivBuf).set(iv);
  const aadBuf = new ArrayBuffer(aad.byteLength); new Uint8Array(aadBuf).set(aad);
  const ctBuf = new ArrayBuffer(ciphertext.byteLength); new Uint8Array(ctBuf).set(ciphertext);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf, additionalData: aadBuf }, key, ctBuf);
  return new Blob([plain], { type: 'application/octet-stream' });
}

// Utils
function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromB64(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const NODE_ALIASES = [
  'atlas','borealis','ceres','draco','elysium','flux','gaia','helios','io','janus','kronos','lyra','mercury','nexus','orion','phoenix','quanta','rhea','sol','tauri','umbra','vulcan','warp','xenon','yotta','zephyr','aether','blazar','cygnus','dorado','equuleus','fornax','gemini','horologium','indus','lacerta','monoceros','norma','ophiuchus','pyxis','reticulum','scutum','telescopium','volans'
];

function generateNodeAliases(count = 3): string[] {
  const out: string[] = [];
  const pool = [...NODE_ALIASES];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}
