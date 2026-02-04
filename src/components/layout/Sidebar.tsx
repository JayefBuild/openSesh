import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Zap,
  Wrench,
  Settings,
  FolderOpen,
  ChevronLeft,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useThreadStore } from '@/stores/threadStore';
import { Button } from '@/components/ui/Button';
import { ProjectList } from '@/components/sidebar/ProjectList';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleSettingsModal = useUIStore((state) => state.toggleSettingsModal);
  const panelSizes = useUIStore((state) => state.panelSizes);

  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const addProject = useProjectStore((state) => state.addProject);
  const setActiveProject = useProjectStore((state) => state.setActiveProject);
  const createThread = useThreadStore((state) => state.createThread);

  const handleNewThread = () => {
    if (activeProjectId) {
      createThread(activeProjectId);
    }
  };

  const handleOpenProject = async () => {
    try {
      const selectedPath = await invoke<string | null>('select_directory');
      if (selectedPath) {
        // Extract folder name from path
        const name = selectedPath.split('/').pop() || selectedPath;
        // Check if it's a git repo
        const isGitRepo = await invoke<boolean>('is_git_repository', { path: selectedPath });
        // Add the project
        const project = addProject({
          name,
          path: selectedPath,
          isGitRepo,
        });
        // Set as active
        setActiveProject(project.id);
      }
    } catch (error) {
      console.error('Failed to open project:', error);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {sidebarOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: panelSizes.sidebar, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'flex flex-col h-full bg-[#0f0f0f] border-r border-[#333] overflow-hidden',
            className
          )}
        >
          {/* Header with collapse button */}
          <div className="flex items-center justify-between px-3 pt-8 pb-3 border-b border-[#333]">
            <span className="text-sm font-semibold text-[#a0a0a0]">Open Sesh</span>
            <button
              onClick={toggleSidebar}
              className="p-1 rounded hover:bg-[#252525] text-[#666] hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* New Thread Button */}
          <div className="p-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-start"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={handleNewThread}
              disabled={!activeProjectId}
            >
              New Thread
            </Button>
          </div>

          {/* Sections */}
          <div className="flex-1 overflow-y-auto">
            {/* Automations Section */}
            <SidebarSection
              title="Automations"
              icon={<Zap className="h-4 w-4" />}
              defaultCollapsed
            >
              <div className="px-3 py-2">
                <p className="text-xs text-[#666]">No automations configured</p>
              </div>
            </SidebarSection>

            {/* Skills Section */}
            <SidebarSection
              title="Skills"
              icon={<Wrench className="h-4 w-4" />}
              defaultCollapsed
            >
              <div className="px-3 py-2">
                <p className="text-xs text-[#666]">No skills configured</p>
              </div>
            </SidebarSection>

            {/* Projects & Threads */}
            <SidebarSection
              title="Projects"
              icon={<FolderOpen className="h-4 w-4" />}
              action={
                <button
                  onClick={handleOpenProject}
                  className="p-1 rounded hover:bg-[#333] text-[#666] hover:text-white transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              }
            >
              <ProjectList />
            </SidebarSection>
          </div>

          {/* Footer with Settings */}
          <div className="p-3 border-t border-[#333]">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              leftIcon={<Settings className="h-4 w-4" />}
              onClick={toggleSettingsModal}
            >
              Settings
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

interface SidebarSectionProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}

function SidebarSection({
  title,
  icon,
  action,
  children,
  defaultCollapsed = false,
}: SidebarSectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  return (
    <div className="border-b border-[#333]">
      <div className="flex items-center justify-between px-3 py-2 hover:bg-[#252525] transition-colors">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-sm text-[#a0a0a0] flex-1"
        >
          {icon}
          {title}
        </button>
        {action && (
          <div className="flex items-center gap-1">{action}</div>
        )}
      </div>
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
