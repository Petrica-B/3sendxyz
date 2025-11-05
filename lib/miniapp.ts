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

export const buildMiniAppManifest = () => {
  const baseUrl = normalizeUrl(DEFAULT_BASE_URL);

  return {
    accountAssociation: {
      header:
        'eyJmaWQiOjE0NDE4MDYsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg1NDU3REE1N0Q1NTYzZDZiMjgzRDZmZWYyMzczMzhBNEI1YUU1QTFGIn0',
      payload: 'eyJkb21haW4iOiIzc2VuZC54eXoifQ',
      signature:
        'HAO/Go1HGayEPFXgg+AGv5M57J1kUfJfCLcrl+dJCT8VJhUtkveK0cr1lx0pSNsgbfNu5SE+MOAyASJQgr6hRBw=',
    },
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
