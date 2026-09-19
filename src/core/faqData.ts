import { BRAND, SERVER, FAQ_CATEGORIES, type FaqCategory } from '../constants.js';
import type { FaqEntry } from '../types/index.js';

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    category: 'ads',
    label: 'Ads Info & Infrastructure',
    question: 'Why are there ads on the website?',
    answer: [
      'Advertising revenue directly covers high-performance video server hosting and infrastructure costs.',
      '',
      '• AnimeX does **not** accept monetary donations.',
      '• Ads will be systematically reduced as sustainable infrastructure scales.',
    ].join('\n'),
  },
  {
    category: 'episodes',
    label: 'Episode Troubleshooting',
    question: 'Why are episodes or search results not loading?',
    answer: [
      '1. **Switch Provider**: Switch between **Neko**, **Kiwi**, **Beep**, **Mimi**, **Yuki**, or **Sora**.',
      '2. **Refresh Episodes**: Click **Refresh Episodes** and wait for the green confirmation.',
      '3. **Clear Cache**: Clear browser cache & cookies, or open in **Incognito Mode**.',
      '4. **Check Extensions**: Disable aggressive security extensions blocking video CDNs.',
    ].join('\n'),
  },
  {
    category: 'player',
    label: 'Video Players & Providers',
    question: 'Which video providers and players are available?',
    answer: [
      'AnimeX provides high-speed providers with automatic best-source selection:',
      '• **N** — Neko',
      '• **K** — Kiwi',
      '• **B** — Beep',
      '• **M** — Mimi',
      '• **Y** — Yuki',
      '• **S** — Sora',
      '',
      '💡 **Tip**: If one provider buffers in your region, click the provider dropdown to switch. You can also toggle between **Default Player** and **ArtPlayer** in player settings.',
    ].join('\n'),
  },
  {
    category: 'images',
    label: 'Image & GIF Permissions',
    question: "Why can't I send images or GIFs in chat?",
    answer: 'Image and GIF embedding permissions unlock automatically upon reaching **Level 5** in the server.',
  },
  {
    category: 'sync',
    label: 'Account Sync & Import',
    question: 'Can I sync my AniList or MyAnimeList account?',
    answer: [
      '**Yes!** AnimeX supports full AniList & MyAnimeList integration.',
      '',
      '• **Import Watchlist**: [animex.one/profile/account](https://animex.one/profile/account)',
      '• **Connect Accounts**: [animex.one/settings](https://animex.one/settings)',
    ].join('\n'),
  },
  {
    category: 'support',
    label: 'Website Support',
    question: 'How do I get help with website issues?',
    answer: [
      'If you encounter an issue on the website, create a ticket in:',
      '',
      `🎫 <#${SERVER.ticketChannelId}>`,
    ].join('\n'),
  },
  {
    category: 'schedule',
    label: 'Release Schedule',
    question: 'When are new anime episodes released?',
    answer: [
      'New episodes are uploaded shortly after airing live in Japan.',
      '',
      `Check live release schedules on [animex.one](${BRAND.website}).`,
    ].join('\n'),
  },
  {
    category: 'mobile',
    label: 'Mobile Streaming',
    question: 'Can I stream AnimeX on mobile devices?',
    answer: [
      '**Yes!** AnimeX is fully optimized for iOS & Android mobile browsers.',
      'Tap **Add to Home Screen** in your mobile browser to install it as a Web App.',
    ].join('\n'),
  },
  {
    category: 'download',
    label: 'Download Episodes',
    question: 'How do I download anime episodes from AnimeX?',
    answer: [
      '**Step 1**: Open any episode page and click the **Download icon** (📥) below the video player.',
      '',
      '**Step 2**: Select your preferred stream option (**SUB** or **DUB**).',
      '',
      '**Step 3**: On the download server page, wait a few seconds for verification, then click **Download**.',
      '',
      '**Step 4**: For Batch Downloads requiring Google Drive access, click **Join Group** once on the Google Group page to unlock all private batch drives.',
      '',
      '**Step 5**: Play your downloaded file with any media player (**VLC** or **QuickTime**).',
    ].join('\n'),
  },
  {
    category: 'password',
    label: 'Password Reset & Recovery',
    question: 'How do I reset my password or recover my account?',
    answer: [
      '• **With Backup Codes**: Go to [animex.one/reset-password](https://animex.one/reset-password) and enter your exact username (`animex.one/user/<YourUsername>`) + backup code.',
      '• **Without Backup Codes**: Open a support ticket in <#1320161905695789095> to receive a manual reset code from an admin.',
    ].join('\n'),
  },
  {
    category: 'profile',
    label: 'Custom Avatars & Banners',
    question: 'How do I set a custom profile picture or banner?',
    answer: [
      '• **Presets**: Select preset avatars & banners directly in your account settings on [animex.one](https://animex.one).',
      '• **Custom Images**: For custom avatars (120x120) or banners (952x200), upload your image to Imgur and request it in server tickets or DM an admin.',
    ].join('\n'),
  },
];

export const faqByCategory = new Map<string, FaqEntry>(
  FAQ_ENTRIES.map((entry) => [entry.category, entry]),
);

export function isKnownCategory(category: string): category is FaqCategory {
  return (FAQ_CATEGORIES as readonly string[]).includes(category);
}
