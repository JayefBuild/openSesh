import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/Dropdown';

interface ModelSelectorProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  className?: string;
}

export function ModelSelector({
  providerId,
  modelId,
  onChange,
  className,
}: ModelSelectorProps) {
  const providers = useSettingsStore((state) => state.providers);
  const getModelById = useSettingsStore((state) => state.getModelById);

  const currentModel = getModelById(providerId, modelId);

  // Provider icons (simple colored dots for now)
  const providerColors: Record<string, string> = {
    anthropic: 'bg-orange-500',
    openai: 'bg-green-500',
    google: 'bg-blue-500',
  };

  return (
    <DropdownMenu
      trigger={
        <button
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#252525] transition-colors',
            className
          )}
        >
          <span
            className={cn('w-2 h-2 rounded-full', providerColors[providerId] || 'bg-gray-500')}
          />
          <span className="text-xs text-[#a0a0a0] truncate max-w-[120px]">
            {currentModel?.name || 'Select model'}
          </span>
          <ChevronDown className="h-3 w-3 text-[#666]" />
        </button>
      }
      align="left"
      className={className}
    >
      {providers.map((provider, index) => (
        <Fragment key={provider.id}>
          {index > 0 && <DropdownSeparator />}
          <div className="px-3 py-1">
            <span className="text-xs text-[#666] font-medium">{provider.name}</span>
          </div>
          {provider.models.map((model) => (
            <DropdownItem
              key={model.id}
              onClick={() => onChange(provider.id, model.id)}
              icon={
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    providerColors[provider.id] || 'bg-gray-500'
                  )}
                />
              }
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={cn(
                    provider.id === providerId && model.id === modelId && 'text-blue-500'
                  )}
                >
                  {model.name}
                </span>
                <span className="text-xs text-[#666] ml-2">
                  {(model.contextWindow / 1000).toFixed(0)}K
                </span>
              </div>
            </DropdownItem>
          ))}
        </Fragment>
      ))}
    </DropdownMenu>
  );
}
