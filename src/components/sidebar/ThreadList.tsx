import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useThreadStore } from '@/stores/threadStore';
import { ThreadItem } from './ThreadItem';

interface ThreadListProps {
  projectId: string;
  className?: string;
}

export function ThreadList({ projectId, className }: ThreadListProps) {
  const allThreads = useThreadStore((state) => state.threads);
  const threads = useMemo(
    () => allThreads
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [allThreads, projectId]
  );

  if (threads.length === 0) {
    return (
      <div className={cn('py-2 px-2', className)}>
        <p className="text-xs text-[#666]">No threads</p>
      </div>
    );
  }

  // Group threads by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: { label: string; threads: typeof threads }[] = [];

  const todayThreads = threads.filter((t) => new Date(t.updatedAt) >= today);
  const yesterdayThreads = threads.filter(
    (t) => new Date(t.updatedAt) >= yesterday && new Date(t.updatedAt) < today
  );
  const lastWeekThreads = threads.filter(
    (t) => new Date(t.updatedAt) >= lastWeek && new Date(t.updatedAt) < yesterday
  );
  const olderThreads = threads.filter((t) => new Date(t.updatedAt) < lastWeek);

  if (todayThreads.length > 0) {
    groups.push({ label: 'Today', threads: todayThreads });
  }
  if (yesterdayThreads.length > 0) {
    groups.push({ label: 'Yesterday', threads: yesterdayThreads });
  }
  if (lastWeekThreads.length > 0) {
    groups.push({ label: 'Last 7 days', threads: lastWeekThreads });
  }
  if (olderThreads.length > 0) {
    groups.push({ label: 'Older', threads: olderThreads });
  }

  return (
    <div className={cn('space-y-3 py-1', className)}>
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-xs text-[#666] px-2 mb-1">{group.label}</p>
          <div className="space-y-0.5">
            {group.threads.map((thread) => (
              <ThreadItem key={thread.id} thread={thread} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
