import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '@/types';
import { generateId } from '@/lib/utils';

interface ProjectStore {
  projects: Project[];
  activeProjectId: string | null;

  // Actions
  addProject: (project: Omit<Project, 'id'>) => Project;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => Project | null;
  setProjects: (projects: Project[]) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      addProject: (projectData) => {
        const project: Project = {
          id: generateId(),
          ...projectData,
        };
        set((state) => ({
          projects: [...state.projects, project],
        }));
        return project;
      },

      removeProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));
      },

      setActiveProject: (id) => {
        set({ activeProjectId: id });
      },

      getActiveProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((p) => p.id === activeProjectId) || null;
      },

      setProjects: (projects) => {
        set({ projects });
      },
    }),
    {
      name: 'opensesh-projects',
      version: 1,
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
      migrate: (persistedState, version) => {
        if (version === 0) {
          // Clear old demo/mock data
          return { projects: [], activeProjectId: null };
        }
        return persistedState as ProjectStore;
      },
    }
  )
);
