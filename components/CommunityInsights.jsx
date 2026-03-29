'use client';

import { communityInsights } from '@/lib/topics';

export default function CommunityInsights() {
  return (
    <div className="px-5 mb-8">
      <h2 className="text-sm font-medium text-charcoal/50 mb-3">
        Community Insights
      </h2>
      <div className="space-y-3">
        {communityInsights.map((insight, i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-4 border border-stone/40 card-hover"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-stone flex items-center justify-center shrink-0">
                <span className="text-[11px] font-medium text-charcoal/60">
                  {insight.initials}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-charcoal/80 flex-1">
                {insight.text}
              </p>
            </div>
            <div className="flex items-center gap-1 mt-3 ml-11">
              <span className="text-charcoal/30 text-xs">♡</span>
              <span className="text-[11px] text-charcoal/40">{insight.likes}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
