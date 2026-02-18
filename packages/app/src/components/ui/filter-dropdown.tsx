import React, { useState, useRef, useEffect } from 'react';
import { SearchIcon, X } from 'lucide-react';

interface FilterDropdownProps {
  placeholder: string;
  items: Array<{ id: string; title: string }>;
  selectedItems: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  width?: number;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  placeholder,
  items,
  selectedItems,
  onSelectionChange,
  width = 426,
  height = 40,
  borderRadius = 99,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the dropdown container
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery(''); // Clear search when closing
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    // Register listeners - use capture phase for better event handling
    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleItemToggle = (itemId: string) => {
    const isSelected = selectedItems.includes(itemId);
    if (isSelected) {
      onSelectionChange(selectedItems.filter(id => id !== itemId));
    } else {
      onSelectionChange([...selectedItems, itemId]);
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange([]);
    setIsOpen(false);
    setSearchQuery('');
  };

  // Filter items based on search query - search for entire phrase as whole (case-insensitive)
  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }
    
    const searchPhrase = searchQuery.trim().toLowerCase();
    
    if (searchPhrase.length === 0) {
      return items;
    }
    
    // Filter items where the entire search phrase appears in the title (case-insensitive)
    return items.filter(item => {
      const titleLower = item.title.toLowerCase();
      // Check if the entire phrase appears in the title
      return titleLower.includes(searchPhrase);
    });
  }, [items, searchQuery]);

  const handleToggleAll = () => {
    // If all filtered items are selected, deselect all
    // Otherwise, select all filtered items
    const allFilteredSelected = filteredItems.every(item => selectedItems.includes(item.id));

    if (allFilteredSelected) {
      // Remove all filtered items from selection
      const remainingSelected = selectedItems.filter(id => !filteredItems.some(item => item.id === id));
      onSelectionChange(remainingSelected);
    } else {
      // Add all filtered items to selection
      const newSelection = [...new Set([...selectedItems, ...filteredItems.map(item => item.id)])];
      onSelectionChange(newSelection);
    }
  };

  // Check if all filtered items are selected
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedItems.includes(item.id));
  const someFilteredSelected = filteredItems.some(item => selectedItems.includes(item.id)) && !allFilteredSelected;

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to ensure the DOM element is mounted before focusing
      const timeoutId = setTimeout(() => {
        if (searchInputRef.current && typeof searchInputRef.current.focus === 'function') {
          searchInputRef.current.focus();
        }
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 0,
          width,
          height,
          flex: 'none',
          order: 0,
          alignSelf: 'stretch',
          flexGrow: 0
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: '0px 16px',
            gap: 8,
            width,
            height,
            background: 'var(--list-item-background-color)',
            borderRadius,
            cursor: 'pointer',
            flex: 'none',
            order: 0,
            alignSelf: 'stretch',
            flexGrow: 0,
            backgroundColor: 'var(--list-item-background-color)',
            borderColor: 'var(--border-default)'
          }}
          className="hover:bg-muted transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 0,
              gap: 8,
              width: width - 32, // Subtract padding
              height: height - 8,
              flex: 'none',
              order: 0,
              alignSelf: 'stretch',
              flexGrow: 0
            }}
          >
            {/* Placeholder text */}
            <span
              style={{
                width: 'auto',
                height: 22,
                fontFamily: 'DM Sans',
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: 14,
                lineHeight: '22px',
                color: 'var(--muted-foreground)',
                flex: 'none',
                order: 0,
                flexGrow: 0
              }}
              className="text-muted-foreground"
            >
              {selectedItems.length > 0 
                ? `${placeholder} (+${selectedItems.length})`
                : placeholder
              }
            </span>
            
            {/* MagnifyingGlass */}
            <div
              style={{
                width: 12,
                height: 12,
                flex: 'none',
                order: 1,
                flexGrow: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <SearchIcon 
                size={12} 
                style={{
                  color: 'var(--muted-foreground)',
                  width: 12,
                  height: 12
                }}
                className="text-muted-foreground"
              />
            </div>
            
            {/* Clear filter button - only show when there are selections */}
            {selectedItems.length > 0 && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  flex: 'none',
                  order: 2,
                  flexGrow: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  background: 'var(--muted)',
                  color: 'var(--muted-foreground)',
                  marginLeft: 'auto'
                }}
                className="hover:bg-muted-foreground hover:text-background transition-colors"
                onClick={handleClearAll}
                title="Clear filter"
              >
                <X size={10} />
              </div>
            )}
          </div>
        </div>
        
        {/* Dropdown Menu */}
        {isOpen && (
          <div
            className=""
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              zIndex: 1000,
              background: 'var(--list-item-background-color)',
              borderColor: 'var(--border-default)',
              marginTop: 4
            }}
          >
            {/* Search Input */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search automations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'DM Sans',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  outline: 'none'
                }}
                className="focus:border-primary"
              />
            </div>

            {/* Select/Deselect All Checkbox */}
            <div
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer'
              }}
              className="hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleAll();
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someFilteredSelected;
                    }
                  }}
                  onChange={() => {}}
                  style={{ margin: 0, cursor: 'pointer' }}
                />
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  cursor: 'pointer'
                }}>
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </span>
              </div>
            </div>

            {/* Items List */}
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {filteredItems.length === 0 ? (
                <div style={{
                  padding: '16px',
                  textAlign: 'center',
                  color: 'var(--muted-foreground)',
                  fontSize: 14
                }}>
                  No automations found
                </div>
              ) : (
                filteredItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--foreground)'
                    }}
                    className="hover:bg-muted text-foreground"
                    onClick={() => handleItemToggle(item.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => {}}
                        style={{ margin: 0 }}
                      />
                      <span>{item.title}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterDropdown;
