"use client";

import React from 'react';
import { Select as AntSelect } from 'antd';
import './standardized-select.scss';

export interface StandardizedSelectProps {
  mode?: 'multiple' | 'tags';
  placeholder?: string;
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  label?: string;
  showSearch?: boolean;
  filterOption?: (input: string, option: any) => boolean;
  maxTagCount?: number | 'responsive';
  allowClear?: boolean;
  notFoundContent?: any;
  children?: any;
  size?: 'small' | 'middle' | 'large';
  disabled?: boolean;
  loading?: boolean;
  wrapperClassName?: string;
}

export interface StandardizedSelectOptionProps {
  value: string | number;
  children: any;
  disabled?: boolean;
}

export const StandardizedSelect = ({
  mode,
  placeholder,
  value,
  onChange,
  label,
  showSearch = false,
  filterOption,
  maxTagCount,
  allowClear = false,
  notFoundContent,
  children,
  size = 'middle',
  disabled = false,
  loading = false,
  wrapperClassName,
  ...props
}: StandardizedSelectProps) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  
  return (
    <div 
      ref={wrapperRef}
      className={`standardized-select-wrapper ${wrapperClassName || ''}`}
    >
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <AntSelect
        mode={mode}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        showSearch={showSearch}
        filterOption={filterOption}
        maxTagCount={maxTagCount}
        allowClear={allowClear}
        notFoundContent={notFoundContent}
        size={size}
        disabled={disabled}
        loading={loading}
        className="standardized-select"
        getPopupContainer={(triggerNode) => triggerNode.parentElement || document.body}
        {...props}
      >
        {children}
      </AntSelect>
    </div>
  );
};

export const StandardizedSelectOption = ({
  value,
  children,
  disabled = false,
  ...props
}: StandardizedSelectOptionProps) => {
  return (
    <AntSelect.Option
      value={value}
      disabled={disabled}
      {...props}
    >
      {children}
    </AntSelect.Option>
  );
};
