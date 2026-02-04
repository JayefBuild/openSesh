import React from 'react';
import { ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/stores/projectStore';
import { useThreadStore } from '@/stores/threadStore';
import { ThreadList } from './ThreadList';
import type { Project } from '@/types';

interface ProjectListProps {
  className?: string;
}

export function ProjectList({ className }: ProjectListProps) {
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  if (projects.length === 0) {
    return (
      <div className={cn('px-3 py-8 text-center', className)}>
        <Folder className="h-8 w-8 mx-auto mb-2 text-[#666]" />
        <p className="text-sm text-[#666]">No projects yet</p>
        <p className="text-xs text-[#666] mt-1">Open a folder to get started</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {projects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={project.id === activeProjectId}
        />
      ))}
    </div>
  );
}

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
}

function ProjectItem({ project, isActive }: ProjectItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(isActive);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const allThreads = useThreadStore((state) => state.threads);
  const threads = React.useMemo(
    () => allThreads.filter((t) => t.projectId === project.id),
    [allThreads, project.id]
  );

  const handleClick = () => {
    setIsExpanded(!isExpanded);
    if (!isActive) {
      setActiveProject(project.id);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
          'hover:bg-[#252525] transition-colors',
          isActive && 'bg-[#252525]'
        )}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[#666] transition-transform flex-shrink-0',
            !isExpanded && '-rotate-90'
          )}
        />
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-[#666] flex-shrink-0" />
        )}
        <span className="truncate flex-1 text-left">{project.name}</span>
        {threads.length > 0 && (
          <span className="text-xs text-[#666]">{threads.length}</span>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-4 pl-2 border-l border-[#333]">
              <ThreadList projectId={project.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
