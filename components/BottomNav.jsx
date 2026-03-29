'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isChat = pathname.startsWith('/chat');

  return (
    <nav className="fixed bottom-0 left-0 right-0 nav-blur bg-cream/80 border-t border-stone/50 z-50">
      <div className="max-w-lg mx-auto flex">
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center py-3 transition-colors ${
            isHome ? 'text-charcoal' : 'text-charcoal/40'
          }`}
        >
          <span className="text-xl">◎</span>
          <span className="text-[10px] mt-0.5 font-medium">Home</span>
        </Link>
        <Link
          href="/chat"
          className={`flex-1 flex flex-col items-center py-3 transition-colors ${
            isChat ? 'text-charcoal' : 'text-charcoal/40'
          }`}
        >
          <span className="text-xl">◇</span>
          <span className="text-[10px] mt-0.5 font-medium">Chat</span>
        </Link>
      </div>
    </nav>
  );
}
