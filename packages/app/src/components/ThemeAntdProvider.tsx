"use client";
import React from "react";
import { ConfigProvider as AntConfigProvider, App, theme as antdTheme } from "antd";
import { useTheme } from "@/contexts/ThemeContext";

const ConfigProvider = AntConfigProvider as any;

type Props = {
  children: React.ReactNode;
};

export const ThemeAntdProvider: React.FC<Props> = ({ children }) => {
  const { theme } = useTheme();

  return (
    <ConfigProvider
      theme={{
        token: {
          // colorText: 'var(--text-primary)',
          // colorBgBase: 'var(--bg-primary)',
          // colorTextBase: 'var(--text-primary)',
          // colorBorder: 'var(--border-color)',
          // colorPrimaryBg: '#1A8AF2',
          fontFamily: 'var(--common-font)',
        },
        components: {
          Button: {
            colorPrimary: 'var(--primary-color)'
          }
        },
        algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : undefined,
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
};

export default ThemeAntdProvider;

