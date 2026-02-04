import React, { useCallback, useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ResizableHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

function ResizableHandle({ direction, onResize, className }: ResizableHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    },
    [direction]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      startPos.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        'flex-shrink-0 transition-colors',
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-blue-500'
          : 'h-1 cursor-row-resize hover:bg-blue-500',
        isDragging && 'bg-blue-500',
        className
      )}
    />
  );
}

interface ResizablePanelGroupProps {
  direction: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
}

export function ResizablePanelGroup({
  direction,
  children,
  className,
}: ResizablePanelGroupProps) {
  return (
    <div
      className={cn(
        'flex',
        direction === 'horizontal' ? 'flex-row' : 'flex-col',
        className
      )}
    >
      {children}
    </div>
  );
}

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ResizablePanel({
  children,
  className,
  style,
}: ResizablePanelProps) {
  return (
    <div className={cn('overflow-hidden', className)} style={style}>
      {children}
    </div>
  );
}

interface ResizableProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  className?: string;
}

export function Resizable({ direction, onResize, className }: ResizableProps) {
  return (
    <ResizableHandle direction={direction} onResize={onResize} className={className} />
  );
}

// Custom hook for panel resizing
export function usePanelResize(
  initialSize: number,
  options: {
    minSize?: number;
    maxSize?: number;
    direction?: 'increase' | 'decrease';
  } = {}
) {
  const { minSize = 100, maxSize = 800, direction = 'increase' } = options;
  const [size, setSize] = useState(initialSize);

  const handleResize = useCallback(
    (delta: number) => {
      setSize((prev) => {
        const newSize = direction === 'increase' ? prev + delta : prev - delta;
        return Math.max(minSize, Math.min(maxSize, newSize));
      });
    },
    [minSize, maxSize, direction]
  );

  return { size, handleResize, setSize };
}
