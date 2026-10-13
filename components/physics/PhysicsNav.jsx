'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/physics', label: 'ホーム', icon: '◎', exact: true },
  { href: '/physics/curriculum', label: 'カリキュラム', icon: '☰' },
  { href: '/physics/phenomena', label: '現象から', icon: '◐' },
  { href: '/physics/lab', label: '量子ラボ', icon: '⊗' },
  { href: '/physics/tutor', label: 'チューター', icon: '✦' },
  { href: '/physics/practice', label: '演習', icon: '✎' },
  { href: '/physics/ai', label: 'AI設定', icon: '⚙' },
];

export default function PhysicsNav() {
  const pathname = usePathname();
  const isActive = (item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <header className="sticky top-0 z-40 bg-vacuum/85 backdrop-blur-xl border-b border-edge/70">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link href="/physics" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-quantum to-violetq flex items-center justify-center text-vacuum font-semibold text-[15px] shadow-[0_0_20px_-4px] shadow-quantum/60">
              ψ
            </span>
            <span className="hidden sm:block">
              <span className="block text-[13px] font-semibold tracking-tight leading-none">Quantum Physics Lab</span>
              <span className="block text-[10px] text-qmute mt-0.5 leading-none">高校 → 学部 → 大学院 → 博士</span>
            </span>
          </Link>
          <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            {ITEMS.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    active ? 'bg-quantum/15 text-quantum' : 'text-qmute hover:text-qink hover:bg-panel'
                  }`}
                >
                  <span className="text-[13px]">{item.icon}</span>
                  <span className="hidden xs:inline sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
