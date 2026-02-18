import React, { useState, useRef, useEffect } from 'react';
import { Input } from 'antd';
import { SearchIcon } from 'lucide-react';

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSearch?: (value: string) => void;
  debounceMs?: number;
  width?: number;
  height?: number;
  borderRadius?: number;
  className?: string;
  disabled?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  placeholder = "Search",
  value: controlledValue,
  onChange,
  onSearch,
  debounceMs = 300,
  width = 276,
  height = 40,
  borderRadius = 99,
  className = '',
  disabled = false
}) => {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestValueRef = useRef<string>('');

  // Use controlled value if provided, otherwise use internal state
  const currentValue = controlledValue !== undefined ? controlledValue : internalValue;

  // Debounced search function - uses latest value from ref
  const triggerDebouncedSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (onSearch) {
        // Use the latest value from the ref to ensure we have the complete text
        onSearch(latestValueRef.current);
      }
    }, debounceMs);
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Store the latest value in ref
    latestValueRef.current = newValue;

    // Update internal state if not controlled
    if (controlledValue === undefined) {
      setInternalValue(newValue);
    }

    // Call onChange if provided
    if (onChange) {
      onChange(newValue);
    }

    // Trigger debounced search
    triggerDebouncedSearch();
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      // Use the latest value from ref
      onSearch(latestValueRef.current);
    }
  };

  // Sync latestValueRef when controlled value changes externally
  useEffect(() => {
    if (controlledValue !== undefined) {
      latestValueRef.current = controlledValue;
    }
  }, [controlledValue]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Input
      placeholder={placeholder}
      value={currentValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      variant="filled"
      className={`tab-search-input ${className}`}
      style={{
        width,
        height,
        borderRadius,
        padding: '0px 12px',
        gap: 10
      }}
      suffix={
        <SearchIcon 
          size={16} 
          className="text-muted-foreground"
          style={{ color: 'var(--muted-foreground)' }}
        />
      }
    />
  );
};

export default SearchInput;
