import './globals.css';

export const metadata = {
  title: 'Andon AI Counselor',
  description: 'AI wellness companion — brain optimization meets attachment theory',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Andon',
  },
};

// Next.js 14 では viewport / themeColor は metadata ではなく viewport から書き出す
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#faf9f6',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body className="bg-cream min-h-[100dvh] overscroll-none">
        {children}
      </body>
    </html>
  );
}
