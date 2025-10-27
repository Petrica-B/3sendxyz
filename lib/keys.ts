// Client-side RSA key generation and export helpers

type CryptoGlobal = typeof globalThis & { crypto?: Crypto };

export type GeneratedKeyPair = {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintHex: string;
  createdAt: number;
};

function toPem(base64: string, header: string, footer: string): string {
  const chunks = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${header}-----\n${chunks.join('\n')}\n-----END ${footer}-----`;
}

async function exportKey(key: CryptoKey, format: 'spki' | 'pkcs8'): Promise<ArrayBuffer> {
  const subtle: SubtleCrypto | undefined = (globalThis as CryptoGlobal).crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');
  return subtle.exportKey(format, key);
}

function ab2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function ab2hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateRsaKeyPair(): Promise<GeneratedKeyPair> {
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');

  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const spki = await exportKey(keyPair.publicKey, 'spki');
  const pkcs8 = await exportKey(keyPair.privateKey, 'pkcs8');
  const publicB64 = ab2b64(spki);
  const privateB64 = ab2b64(pkcs8);
  const pubPem = toPem(publicB64, 'PUBLIC KEY', 'PUBLIC KEY');
  const privPem = toPem(privateB64, 'PRIVATE KEY', 'PRIVATE KEY');
  const digest = await subtle.digest('SHA-256', spki);
  const fingerprintHex = ab2hex(digest);

  return {
    publicKeyPem: pubPem,
    privateKeyPem: privPem,
    fingerprintHex,
    createdAt: Date.now(),
  };
}

// Lightweight 12-word mnemonic (mock) generator
const WORDS: string[] = [
  'apple','actor','anchor','april','artist','atom','audio','august','autumn','avenue','baby','bamboo','banana','basic','beacon','bicycle','blade','bliss','blue','bonus','book','border','bottle','brave','breeze','brick','bridge','bright','bubble','buddy','cabin','cactus','candy','canvas','cargo','carpet','cart','castle','celery','chair','chalk','champion','chaos','charge','charm','chat','cheese','cherry','chess','chief','circle','civic','coconut','coffee','coin','color','column','comet','comfort','comic','copper','coral','cotton','cradle','craft','crane','credit','crisp','crowd','crystal','cubic','curious','curtain','cushion','cycle','daisy','dance','daring','data','dawn','deal','deer','delta','dent','desert','detail','dial','diary','dinner','dirt','dizzy','doctor','dolphin','domain','donor','double','dove','draft','dragon','dream','drift','drum','earth','echo','elegant','ember','empire','empty','energy','engine','enjoy','enrich','equal','era','estate','ethos','even','event','ever','exact','exchange','exotic','fabric','fair','faith','falcon','fancy','farm','fast','father','feather','february','field','figure','filter','final','find','finger','fire','fiscal','flame','flash','flight','flock','fluent','flute','focus','forest','fortune','frame','fresh','friend','frost','future','galaxy','garden','gentle','giant','gift','glad','globe','glow','gold','grace','grain','grand','grape','gravity','green','grid','grit','guard','guest','guide','habit','harbor','harvest','hawk','hazel','hero','hidden','hill','hobby','holiday','honey','hover','humble','human','humor','hybrid','ice','icon','idea','idle','image','immune','impact','index','infant','input','iris','island','ivory','jacket','jazz','jeans','jewel','jolly','journey','judge','jungle','junior','keen','kelp','kernel','kettle','key','kick','kid','king','kit','kite','lab','label','ladder','lake','laser','lava','leaf','learn','lemon','level','light','lily','linen','lion','liquid','lizard','local','logic','loyal','lucky','lunar','magic','magnet','major','mango','maple','marble','margin','marine','market','marvel','master','matrix','meadow','melon','memory','merit','metal','meter','midnight','mild','mint','mirror','mobile','model','moment','monster','month','moral','mother','motion','motor','mount','mouse','movie','mud','music','narrow','navy','near','nectar','neon','nest','neutral','noble','noise','north','novel','nuclear','nurse','oak','oasis','ocean','october','olive','omega','onion','opera','orbit','orchid','origin','owl','oxygen','panda','panic','paper','parade','parrot','pastel','path','peach','pearl','pepper','perfect','pet','photo','piano','pilot','pixel','planet','plastic','plaza','poem','poet','polar','polite','pond','power','prairie','praise','pretty','prime','prize','puzzle','quantum','quartz','queen','quest','quick','quiet','radar','radio','ranch','rapid','raven','real','recipe','record','reef','region','relax','ribbon','ridge','ring','ripple','river','robot','rocket','rose','round','royal','rumor','saddle','sage','salad','salmon','salsa','sapphire','saturn','scale','scene','school','scout','scrub','season','second','seed','shadow','silent','silver','simple','singer','six','sketch','sled','sleep','slice','slogan','smart','smile','smoke','snap','solar','solid','sonic','sound','south','space','spark','spice','spider','spike','spirit','split','spoon','sport','spot','spruce','squad','stable','stage','star','stone','story','storm','sunny','super','supreme','surface','surge','swim','sword','symbol','table','tactic','tape','target','teal','tempo','tender','text','tiger','timber','tiny','toast','token','tour','tower','track','trade','trail','transit','tree','trend','trial','trick','tropical','trust','tunnel','turtle','twist','ultra','unicorn','unite','upper','urban','usage','valley','value','vapor','vector','velvet','venture','venus','verge','vessel','victory','video','village','violet','violin','vision','vivid','vocal','volcano','voyage','wagon','walnut','warm','wave','wealth','weather','web','welcome','west','whale','wheat','whisper','wide','wild','willow','wind','window','wing','winter','wire','wisdom','wolf','wonder','wood','world','yellow','yoga','young','zebra','zen','zero','zone'
];

export type GeneratedMnemonicPair = {
  mnemonic: string; // 12-word private key phrase
  words: string[];
  fingerprintHex: string;
  createdAt: number;
};

export async function generateMnemonicKeyPair(wordCount = 12): Promise<GeneratedMnemonicPair> {
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!cryptoObj || !subtle) throw new Error('WebCrypto not available');
  const bytes = new Uint8Array(wordCount);
  cryptoObj.getRandomValues(bytes);
  const words = Array.from(bytes).map((b) => WORDS[b % WORDS.length]);
  const mnemonic = words.join(' ');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(mnemonic));
  const fingerprintHex = ab2hex(digest);
  return { mnemonic, words, fingerprintHex, createdAt: Date.now() };
}
