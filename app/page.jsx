'use client';

import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import StoriesBar from '@/components/StoriesBar';
import QuickMessage from '@/components/QuickMessage';
import RecentSessions from '@/components/RecentSessions';
import CommunityInsights from '@/components/CommunityInsights';

export default function Home() {
  const router = useRouter();

  const handleTopicSelect = (topic) => {
    sessionStorage.setItem('pendingMessage', topic.prompt);
    router.push('/chat');
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <header className="px-5 pt-12 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-charcoal flex items-center justify-center">
            <span className="text-cream text-sm font-serif font-semibold">A</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-charcoal tracking-tight">
              Andon
            </h1>
            <p className="text-[11px] text-charcoal/40">AI Wellness Companion</p>
          </div>
        </div>
      </header>

      {/* Stories Bar */}
      <StoriesBar onTopicSelect={handleTopicSelect} />

      {/* Quick Message */}
      <QuickMessage />

      {/* Recent Sessions */}
      <RecentSessions />

      {/* Community Insights */}
      <CommunityInsights />

      {/* Disclaimer */}
      <p className="text-[10px] text-charcoal/30 text-center px-8 pb-4 leading-relaxed">
        This AI provides general wellness information only. Not a substitute for
        professional medical advice.
      </p>

      <BottomNav />
    </div>
  );
}
