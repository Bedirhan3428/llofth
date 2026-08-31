'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Compass, Tv, Film } from 'lucide-react';

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { href: '/home', label: 'Ana Sayfa', icon: Home, tabIndex: 1 },
    { href: '/search', label: 'Arama', icon: Search, tabIndex: 2 },
    { href: '/search?q=Dune', label: 'Popüler', icon: Compass, tabIndex: 3 },
    { href: '/search?q=Breaking%20Bad', label: 'Diziler', icon: Tv, tabIndex: 4 },
  ];

  return (
    <aside
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onFocusCapture={() => setIsExpanded(true)}
      onBlurCapture={() => setIsExpanded(false)}
      className={`fixed top-0 left-0 h-screen z-40 transition-all duration-200 ease-out bg-[#0d0e14]/95 border-r border-white/5 flex flex-col justify-between py-5 px-2.5 ${
        isExpanded ? 'w-52 shadow-xl' : 'w-16'
      }`}
    >
      <div>
        {/* llofth Logo Link */}
        <Link href="/home" className="flex items-center gap-2.5 px-1.5 mb-7 cursor-pointer outline-none">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
            lf
          </div>
          {isExpanded && (
            <span className="text-base font-bold tracking-wider text-white lowercase">
              llofth
            </span>
          )}
        </Link>

        {/* Menu Navigation Links */}
        <nav className="flex flex-col gap-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === '/home' && pathname === '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={item.tabIndex}
                className={`flex items-center gap-3.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left w-full outline-none ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {isExpanded && (
                  <span className="whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {isExpanded && (
        <div className="px-2 py-2 text-[11px] text-zinc-500 border-t border-white/5">
          <span>llofth media</span>
        </div>
      )}
    </aside>
  );
}
