import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dropdown } from '@/components/ui/Dropdown';
import { useSettingsStore } from '@/stores/settingsStore';
import { SkillsPanel } from '@/components/skills';
import { ExecutionSettingsPanel } from '@/components/execution';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'providers' | 'skills' | 'execution' | 'editor' | 'terminal' | 'shortcuts';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'providers', label: 'Providers' },
    { id: 'skills', label: 'Skills' },
    { id: 'execution', label: 'Execution' },
    { id: 'editor', label: 'Editor' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Settings"
      size="lg"
    >
      <div className="flex gap-6 min-h-[400px]">
        {/* Sidebar */}
        <div className="w-40 flex-shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full px-3 py-2 text-sm text-left rounded-md transition-colors',
                activeTab === tab.id
                  ? 'bg-[#252525] text-white'
                  : 'text-[#a0a0a0] hover:bg-[#252525] hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'providers' && <ProvidersSettings />}
          {activeTab === 'skills' && <SkillsSettings />}
          {activeTab === 'execution' && <ExecutionSettings />}
          {activeTab === 'editor' && <EditorSettings />}
          {activeTab === 'terminal' && <TerminalSettings />}
          {activeTab === 'shortcuts' && <ShortcutsSettings />}
        </div>
      </div>
    </Modal>
  );
}

function GeneralSettings() {
  const theme = useSettingsStore((state) => state.theme);
  const defaultProviderId = useSettingsStore((state) => state.defaultProviderId);
  const defaultModelId = useSettingsStore((state) => state.defaultModelId);
  const providers = useSettingsStore((state) => state.providers);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const selectedProvider = providers.find((p) => p.id === defaultProviderId);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">General Settings</h3>

      <div className="space-y-4">
        <Dropdown
          label="Theme"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
          value={theme}
          onChange={(value) => updateSettings({ theme: value as 'dark' | 'light' | 'system' })}
        />

        <Dropdown
          label="Default Provider"
          options={providers.map((p) => ({ value: p.id, label: p.name }))}
          value={defaultProviderId}
          onChange={(value) => updateSettings({ defaultProviderId: value })}
        />

        {selectedProvider && (
          <Dropdown
            label="Default Model"
            options={selectedProvider.models.map((m) => ({
              value: m.id,
              label: m.name,
              description: `${(m.contextWindow / 1000).toFixed(0)}K context`,
            }))}
            value={defaultModelId}
            onChange={(value) => updateSettings({ defaultModelId: value })}
          />
        )}
      </div>
    </div>
  );
}

function ProvidersSettings() {
  const providers = useSettingsStore((state) => state.providers);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  const handleSaveApiKey = (providerId: string) => {
    // TODO: Save API key via Tauri
    console.log('Save API key for', providerId, apiKeys[providerId]);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">API Providers</h3>

      <div className="space-y-6">
        {providers.map((provider) => (
          <div key={provider.id} className="space-y-2">
            <h4 className="text-sm font-medium">{provider.name}</h4>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={`Enter ${provider.name} API key`}
                value={apiKeys[provider.id] || ''}
                onChange={(e) =>
                  setApiKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))
                }
                className="flex-1"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSaveApiKey(provider.id)}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-[#666]">
              Models: {provider.models.map((m) => m.name).join(', ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorSettings() {
  const editorFontSize = useSettingsStore((state) => state.editorFontSize);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Editor Settings</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#a0a0a0] mb-1.5">
            Font Size
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="20"
              value={editorFontSize}
              onChange={(e) =>
                updateSettings({ editorFontSize: parseInt(e.target.value) })
              }
              className="flex-1"
            />
            <span className="text-sm w-8">{editorFontSize}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalSettings() {
  const terminalFontSize = useSettingsStore((state) => state.terminalFontSize);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Terminal Settings</h3>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#a0a0a0] mb-1.5">
            Font Size
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="20"
              value={terminalFontSize}
              onChange={(e) =>
                updateSettings({ terminalFontSize: parseInt(e.target.value) })
              }
              className="flex-1"
            />
            <span className="text-sm w-8">{terminalFontSize}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillsSettings() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Default Skills</h3>
      <p className="text-sm text-[#666]">
        Configure which AI capabilities are enabled by default for new threads.
        These settings can be overridden per-thread.
      </p>

      <div className="border border-[#333] rounded-lg overflow-hidden -mx-2">
        <SkillsPanel mode="global" />
      </div>
    </div>
  );
}

function ExecutionSettings() {
  return <ExecutionSettingsPanel />;
}

function ShortcutsSettings() {
  const shortcuts = [
    { action: 'Command Palette', shortcut: 'Cmd + K' },
    { action: 'Toggle Terminal', shortcut: 'Cmd + J' },
    { action: 'New Thread', shortcut: 'Cmd + N' },
    { action: 'Settings', shortcut: 'Cmd + ,' },
    { action: 'Toggle Sidebar', shortcut: 'Cmd + B' },
    { action: 'Send Message', shortcut: 'Cmd + Enter' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>

      <div className="space-y-2">
        {shortcuts.map((item) => (
          <div
            key={item.action}
            className="flex items-center justify-between py-2 border-b border-[#333] last:border-0"
          >
            <span className="text-sm">{item.action}</span>
            <kbd className="px-2 py-1 bg-[#252525] rounded text-xs text-[#a0a0a0] font-mono">
              {item.shortcut}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
