import * as React from "react"
import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Hook to suppress hydration warnings caused by browser extensions
export function useSuppressHydrationWarnings() {
  useEffect(() => {
    // Only run in browser environment and development mode
    if (typeof window === 'undefined' || process.env.APP_ENV !== 'development') {
      return;
    }

    // Check if console methods exist before overriding
    if (!console || typeof console.error !== 'function' || typeof console.warn !== 'function') {
      return;
    }

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      // Filter out hydration mismatch warnings and React internal errors
      if (args[0] && typeof args[0] === 'string' && 
          (args[0].includes('A tree hydrated but some attributes') ||
           args[0].includes('kwift.CHROME.js') ||
           args[0].includes('Expected static flag was missing') ||
           args[0].includes('Hydration failed') ||
           args[0].includes('Text content does not match server-rendered HTML'))) {
        return;
      }
      
      // Use direct call instead of apply to avoid hydration issues
      originalError(...args);
    };

    console.warn = (...args) => {
      // Filter out hydration mismatch warnings and React internal errors
      if (args[0] && typeof args[0] === 'string' && 
          (args[0].includes('A tree hydrated but some attributes') ||
           args[0].includes('Expected static flag was missing') ||
           args[0].includes('Hydration failed') ||
           args[0].includes('Text content does not match server-rendered HTML'))) {
        return;
      }
      
      // Use direct call instead of apply to avoid hydration issues
      originalWarn(...args);
    };

    return () => {
      // Restore original console methods
      if (console && typeof console.error === 'function') {
        console.error = originalError;
      }
      if (console && typeof console.warn === 'function') {
        console.warn = originalWarn;
      }
    };
  }, []);
}
