type ManifestRecord = Record<string, undefined | string | string[]>;

const DEFAULT_BASE_URL = 'https://3send.xyz';
const DEFAULT_SPLASH_BACKGROUND = '#FF930E';

const normalizeUrl = (url: string) => url.replace(/\/+$/, '');

const withValidProperties = <T extends ManifestRecord>(properties: T) =>
  Object.fromEntries(
    Object.entries(properties).filter(([_, value]) =>
      Array.isArray(value) ? value.length > 0 : !!value
    )
  );

const resolveAccountAssociation = () => ({
  header: process.env.MINIAPP_ACCOUNT_ASSOCIATION_HEADER || '',
  payload: process.env.MINIAPP_ACCOUNT_ASSOCIATION_PAYLOAD || '',
  signature: process.env.MINIAPP_ACCOUNT_ASSOCIATION_SIGNATURE || '',
});

export const buildMiniAppManifest = () => {
  const baseUrl = normalizeUrl(DEFAULT_BASE_URL);

  return {
    accountAssociation: resolveAccountAssociation(),
    baseBuilder: {
      ownerAddress: '0x4ca1baf0125038cd0c5fcdff9c760bf95b92e484',
    },
    miniapp: withValidProperties({
      version: '1',
      name: '3send.xyz',
      homeUrl: baseUrl,
      iconUrl: `${baseUrl}/Icon.png`,
      splashImageUrl: `${baseUrl}/Splash.png`,
      splashBackgroundColor: DEFAULT_SPLASH_BACKGROUND,
      //verify, not used webhookUrl: resolveWebhookUrl(),
      subtitle: 'Wallet-to-wallet file transfer on Base',
      description:
        'Send encrypted files peer-to-peer using Base wallets and Ratio1 infrastructure. Transfers stay private end-to-end.',
      screenshotUrls: [
        `${baseUrl}/screenshots/s1.png`,
        `${baseUrl}/screenshots/s2.png`,
        `${baseUrl}/screenshots/s3.png`,
      ],
      primaryCategory: 'productivity',
      tags: ['file-transfer', 'base', 'encryption'],
      heroImageUrl: `${baseUrl}/Hero.png`,
      tagline: 'Encrypted file delivery for every Base wallet.',
      ogTitle: '3send.xyz - P2P File Transfer',
      ogDescription: 'P2P file transfer dapp using Ratio1 with Base wallet connect.',
      ogImageUrl: `${baseUrl}/Hero.png`,
    }),
  };
};

export const buildMiniAppEmbedMetadata = () => {
  const baseUrl = normalizeUrl(DEFAULT_BASE_URL);

  const buttonTitle = 'Launch 3send.xyz';

  return {
    version: 'next',
    imageUrl: `${baseUrl}/Icon.png`,
    button: {
      title: buttonTitle,
      action: {
        type: 'launch_miniapp' as const,
        name: '3send.xyz',
        url: baseUrl,
        splashImageUrl: `${baseUrl}/Splash.png`,
        splashBackgroundColor: DEFAULT_SPLASH_BACKGROUND,
      },
    },
  };
};
