type ManifestRecord = Record<string, undefined | string | string[]>;

const DEFAULT_BASE_URL = 'https://3send.xyz';
const DEFAULT_SPLASH_BACKGROUND = '#050b14';

const normalizeUrl = (url: string) => url.replace(/\/+$/, '');

const parseList = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];

const withValidProperties = <T extends ManifestRecord>(properties: T) =>
  Object.fromEntries(
    Object.entries(properties).filter(([_, value]) => (Array.isArray(value) ? value.length > 0 : !!value))
  );

const resolveBaseUrl = () => {
  const envUrl =
    process.env.NEXT_PUBLIC_MINIAPP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MINIAPP_HOME_URL ||
    DEFAULT_BASE_URL;

  try {
    return normalizeUrl(new URL(envUrl).toString());
  } catch (_error) {
    return normalizeUrl(DEFAULT_BASE_URL);
  }
};

const resolveOwnerAddress = () => process.env.MINIAPP_OWNER_ADDRESS || '';

const resolveAccountAssociation = () => ({
  header: process.env.MINIAPP_ACCOUNT_ASSOCIATION_HEADER || '',
  payload: process.env.MINIAPP_ACCOUNT_ASSOCIATION_PAYLOAD || '',
  signature: process.env.MINIAPP_ACCOUNT_ASSOCIATION_SIGNATURE || '',
});

const resolveWebhookUrl = () => process.env.MINIAPP_WEBHOOK_URL || undefined;

const resolveScreenshotUrls = () => parseList(process.env.MINIAPP_SCREENSHOT_URLS);

export const buildMiniAppManifest = () => {
  const baseUrl = resolveBaseUrl();

  return {
    accountAssociation: resolveAccountAssociation(),
    baseBuilder: {
      ownerAddress: resolveOwnerAddress(),
    },
    miniapp: withValidProperties({
      version: '1',
      name: '3send.xyz',
      homeUrl: baseUrl,
      iconUrl: `${baseUrl}/android-chrome-192x192.png`,
      splashImageUrl: `${baseUrl}/android-chrome-512x512.png`,
      splashBackgroundColor: DEFAULT_SPLASH_BACKGROUND,
      webhookUrl: resolveWebhookUrl(),
      subtitle: 'Wallet-to-wallet file transfer on Base',
      description:
        'Send encrypted files peer-to-peer using Base wallets and Ratio1 infrastructure. Transfers stay private end-to-end.',
      screenshotUrls: resolveScreenshotUrls(),
      primaryCategory: 'productivity',
      tags: ['file-transfer', 'base', 'encryption'],
      heroImageUrl: `${baseUrl}/3sendClear.svg`,
      tagline: 'Encrypted file delivery for every Base wallet.',
      ogTitle: '3send.xyz — P2P File Transfer',
      ogDescription: 'P2P file transfer dapp using Ratio1 with Base wallet connect.',
      ogImageUrl: `${baseUrl}/3sendClear.svg`,
    }),
  };
};

export const buildMiniAppEmbedMetadata = () => {
  const baseUrl = resolveBaseUrl();

  const buttonTitle = 'Launch 3send.xyz';

  return {
    version: 'next',
    imageUrl: `${baseUrl}/android-chrome-512x512.png`,
    button: {
      title: buttonTitle,
      action: {
        type: 'launch_miniapp' as const,
        name: '3send.xyz',
        url: baseUrl,
        splashImageUrl: `${baseUrl}/android-chrome-512x512.png`,
        splashBackgroundColor: DEFAULT_SPLASH_BACKGROUND,
      },
    },
  };
};
