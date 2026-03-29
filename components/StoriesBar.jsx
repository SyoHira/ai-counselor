'use client';

import { topics } from '@/lib/topics';

export default function StoriesBar({ onTopicSelect }) {
  return (
    <div className="no-scrollbar overflow-x-auto flex gap-4 px-5 py-4">
      {topics.map((topic) => (
        <button
          key={topic.id}
          onClick={() => onTopicSelect(topic)}
          className="flex flex-col items-center gap-1.5 shrink-0"
        >
          <div className="stories-ring">
            <div className="w-[60px] h-[60px] rounded-full bg-cream flex items-center justify-center text-2xl">
              {topic.icon}
            </div>
          </div>
          <span className="text-[11px] text-charcoal/70 font-medium">
            {topic.label}
          </span>
        </button>
      ))}
    </div>
  );
}
