import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  disabled,
  className,
  triggerClassName,
  menuClassName,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-[#a0a0a0] mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'w-full h-9 px-3 flex items-center justify-between gap-2',
          'bg-[#1a1a1a] border border-[#333] rounded-md text-sm',
          'hover:bg-[#252525] transition-colors',
          'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500',
          disabled && 'opacity-50 cursor-not-allowed',
          triggerClassName
        )}
        disabled={disabled}
      >
        <span className={cn('truncate', !selectedOption && 'text-[#666]')}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[#666] transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 w-full mt-1 py-1',
              'bg-[#1a1a1a] border border-[#333] rounded-md shadow-lg',
              'max-h-60 overflow-auto',
              menuClassName
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => !option.disabled && handleSelect(option.value)}
                className={cn(
                  'w-full px-3 py-2 flex items-center gap-2 text-sm text-left',
                  'hover:bg-[#252525] transition-colors',
                  option.disabled && 'opacity-50 cursor-not-allowed',
                  option.value === value && 'bg-[#252525]'
                )}
                disabled={option.disabled}
              >
                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{option.label}</div>
                  {option.description && (
                    <div className="text-xs text-[#666] truncate">{option.description}</div>
                  )}
                </div>
                {option.value === value && (
                  <Check className="h-4 w-4 text-blue-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simple dropdown menu component
interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  children,
  align = 'left',
  className,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 mt-1 py-1 min-w-[160px]',
              'bg-[#1a1a1a] border border-[#333] rounded-md shadow-lg',
              align === 'right' ? 'right-0' : 'left-0'
            )}
            onClick={() => setIsOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function DropdownItem({
  children,
  onClick,
  icon,
  shortcut,
  danger,
  disabled,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 flex items-center gap-2 text-sm text-left',
        'hover:bg-[#252525] transition-colors',
        danger && 'text-red-500 hover:text-red-400',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {icon && <span className="flex-shrink-0 text-[#666]">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-[#666]">{shortcut}</span>}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="h-px bg-[#333] my-1" />;
}
