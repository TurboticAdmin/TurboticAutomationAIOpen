import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import './globals.css'
import './responsive.scss';
import "@ant-design/v5-patch-for-react-19";

import React from "react";

import { ConfigProvider as AntConfigProvider } from "antd";
import ThemeAntdProvider from "@/components/ThemeAntdProvider";

const ConfigProvider = AntConfigProvider as any;
import { AuthProvider } from "./authentication";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { setupResponsiveScaling } from "@/lib/utils";
import { Header } from '@/components/Header';
import Sidebar from "@/components/Sidebar";
import { UpgradeProvider } from "@/contexts/UpgradeContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
})


export const metadata: Metadata = {
  title: "Turbotic Automation AI",
  description: "A platform to generate and operate micro automations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Suppress Dashlane extension errors and hydration warnings
  if (typeof window !== 'undefined') {
    // Suppress console errors from Dashlane
    const originalError = console.error;
    console.error = (...args) => {
      // Filter out Dashlane extension errors
      if (args[0] && typeof args[0] === 'string' && args[0].includes('kwift.CHROME.js')) {
        return;
      }
      // Filter out hydration mismatch warnings caused by browser extensions
      if (args[0] && typeof args[0] === 'string' && args[0].includes('A tree hydrated but some attributes')) {
        return;
      }
      // Filter out hydration warnings from React
      if (args[0] && typeof args[0] === 'string' && args[0].includes('hydration')) {
        return;
      }
      originalError.apply(console, args);
    };

    // Suppress console warnings from hydration mismatches
    const originalWarn = console.warn;
    console.warn = (...args) => {
      // Filter out hydration mismatch warnings
      if (args[0] && typeof args[0] === 'string' && args[0].includes('A tree hydrated but some attributes')) {
        return;
      }
      // Filter out hydration warnings from React
      if (args[0] && typeof args[0] === 'string' && args[0].includes('hydration')) {
        return;
      }
      originalWarn.apply(console, args);
    };

    // Suppress React's internal error logging
    const originalLog = console.log;
    console.log = (...args) => {
      // Filter out hydration-related logs
      if (args[0] && typeof args[0] === 'string' && args[0].includes('hydration')) {
        return;
      }
      originalLog.apply(console, args);
    };
  }

  return (
    <html lang="en" suppressHydrationWarning className="responsive-body">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Initialize responsive scaling
              (function() {
                function getDevicePixelRatio() {
                  return window.devicePixelRatio || 1;
                }
                function getScreenSize() {
                  return {
                    width: window.innerWidth,
                    height: window.innerHeight
                  };
                }
                function getOptimalScaleFactor() {
                  const dpr = getDevicePixelRatio();
                  const { width } = getScreenSize();
                  let scaleFactor = 1;
                  if (width <= 480) {
                    scaleFactor = 0.75;
                  } else if (width <= 640) {
                    scaleFactor = 0.8;
                  } else if (width <= 768) {
                    scaleFactor = 0.85;
                  } else if (width <= 1024) {
                    scaleFactor = 0.9;
                  } else if (width <= 1280) {
                    scaleFactor = 0.95;
                  } else if (width <= 1440) {
                    scaleFactor = 1;
                  } else if (width <= 1536) {
                    scaleFactor = 1;
                  } else if (width <= 1920) {
                    scaleFactor = 1.05;
                  } else {
                    scaleFactor = 1.1;
                  }
                  let dpiScale = 1;
                  if (dpr >= 2) {
                    dpiScale = 0.8;
                  } else if (dpr >= 1.5) {
                    dpiScale = 0.85;
                  }
                  if (width <= 900 && dpr >= 1.8) {
                    scaleFactor = 0.8;
                    dpiScale = 0.85;
                  }
                  if (width >= 1440 && width <= 1536) {
                    scaleFactor = 1;
                    dpiScale = 1;
                  }
                  return scaleFactor * dpiScale;
                }
                function applyResponsiveScaling() {
                  const scaleFactor = getOptimalScaleFactor();
                  document.documentElement.style.setProperty('--scale-factor', scaleFactor.toString());
                  document.documentElement.style.setProperty('--dpi-scale', getDevicePixelRatio() >= 1.5 ? '0.85' : '1');
                }
                applyResponsiveScaling();
                let resizeTimeout;
                window.addEventListener('resize', () => {
                  clearTimeout(resizeTimeout);
                  resizeTimeout = setTimeout(applyResponsiveScaling, 100);
                });
                window.addEventListener('orientationchange', () => {
                  setTimeout(applyResponsiveScaling, 100);
                });
              })();
              // Force dark mode on first load
              // Commented out as we are using light theme for the app
              // document.documentElement.classList.add('dark');
              // localStorage.setItem('theme', 'dark');
              // Suppress hydration warnings from browser extensions
              (function() {
                const originalError = console.error;
                const originalWarn = console.warn;
                const originalLog = console.log;
                console.error = function(...args) {
                  if (args[0] && typeof args[0] === 'string' && 
                      (args[0].includes('kwift.CHROME.js') || 
                       args[0].includes('A tree hydrated but some attributes') ||
                       args[0].includes('hydration') ||
                       args[0].includes('data-dashlane'))) {
                    return;
                  }
                  originalError.apply(console, args);
                };
                console.warn = function(...args) {
                  if (args[0] && typeof args[0] === 'string' && 
                      (args[0].includes('A tree hydrated but some attributes') ||
                       args[0].includes('hydration') ||
                       args[0].includes('data-dashlane'))) {
                    return;
                  }
                  originalWarn.apply(console, args);
                };
                console.log = function(...args) {
                  if (args[0] && typeof args[0] === 'string' && 
                      (args[0].includes('hydration') ||
                       args[0].includes('data-dashlane'))) {
                    return;
                  }
                  originalLog.apply(console, args);
                };
                if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                  const originalEmit = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.emit;
                  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.emit = function(...args) {
                    if (args[0] === 'error' && args[1] && args[1].message && 
                        args[1].message.includes('hydration')) {
                      return;
                    }
                    return originalEmit.apply(this, args);
                  };
                }
              })();
            `
          }}
        />
      </head>
      <body
        className={`${dmSans.className} antialiased`}
      >
        <ThemeProvider>
          <ThemeAntdProvider>
            <AuthProvider>
              <UpgradeProvider>
                  <div className="flex flex-col h-full">
                    <Header />
                    <div className="flex h-full">
                      <Sidebar />
                      <div
                        className="flex-1"
                        style={{ marginLeft: 'var(--sidebar-width)', maxWidth: 'calc(100% - var(--sidebar-width))', transition: 'transition: all 0.3' }}
                      >
                        {children}
                      </div>
                    </div>
                  </div>
                  <Toaster />
                  <SonnerToaster />
              </UpgradeProvider>
            </AuthProvider>
          </ThemeAntdProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
