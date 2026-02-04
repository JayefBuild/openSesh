import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { PendingChangesPanel } from './PendingChangesPanel';
import { usePendingChangesStore } from '@/stores/pendingChangesStore';
import { useUIStore } from '@/stores/uiStore';

interface PendingChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PendingChangesModal({ isOpen, onClose }: PendingChangesModalProps) {
  const pendingChanges = usePendingChangesStore((state) => state.pendingChanges);

  // Don't render if no changes
  if (pendingChanges.length === 0 && !isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 z-50 flex flex-col"
          >
            <div className="flex-1 bg-[#0f0f0f] border border-[#333] rounded-xl overflow-hidden flex flex-col shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#333]">
                <h2 className="text-lg font-semibold">Review File Changes</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-[#252525] rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-[#a0a0a0]" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0">
                <PendingChangesPanel />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to open the pending changes modal
 */
export function usePendingChangesModal() {
  const setPendingChangesOpen = useUIStore((state) => state.setPendingChangesOpen);
  const pendingChangesOpen = useUIStore((state) => state.pendingChangesOpen);
  const pendingChanges = usePendingChangesStore((state) => state.pendingChanges);

  const open = () => setPendingChangesOpen(true);
  const close = () => setPendingChangesOpen(false);
  const toggle = () => setPendingChangesOpen(!pendingChangesOpen);

  return {
    isOpen: pendingChangesOpen,
    open,
    close,
    toggle,
    hasPendingChanges: pendingChanges.length > 0,
    pendingCount: pendingChanges.filter((c) => c.status === 'pending').length,
    approvedCount: pendingChanges.filter((c) => c.status === 'approved').length,
  };
}
