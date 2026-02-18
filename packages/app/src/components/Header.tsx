"use client";
import { useAuth } from "@/app/authentication";
import { Button } from "antd";
import { UserMenu } from "./UserMenu";
import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const Header = () => {
  const { currentUser, hasInitialised, getCurrentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const pathname = usePathname();
  const isCanvasPage = pathname?.startsWith('/canvas/');

  useEffect(() => {
    // Check initial sidebar state from localStorage
    const collapsed = localStorage.getItem("sidebar-collapsed");
    setSidebarCollapsed(collapsed === "true");

    // Listen for storage changes (when sidebar is toggled)
    const handleStorageChange = () => {
      const collapsed = localStorage.getItem("sidebar-collapsed");
      setSidebarCollapsed(collapsed === "true");
    };

    window.addEventListener("storage", handleStorageChange);
    // Also listen for custom event when localStorage is updated in same tab
    const interval = setInterval(() => {
      const collapsed = localStorage.getItem("sidebar-collapsed");
      setSidebarCollapsed(collapsed === "true");
    }, 100);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="flex items-center justify-between px-8 py-6 relative z-10" style={{ marginLeft: 'var(--sidebar-width)' }}>
      <div className="flex items-center gap-6">
        {/* Always show logo on canvas page only */}
        {isCanvasPage && (
          <Link href="/">
            <img
              src={theme === 'light' ? "/images/logo-horizontal.svg": '/images/turbotic-logo.png'}
              alt="Turbotic Logo"
              className="h-8 w-auto block"
            />
          </Link>
        )}
        {/* Show logo on landing page when logged out */}
        {pathname === '/' && !currentUser && (
          <Link 
            href="/" 
            className="hover:opacity-80 transition-opacity"
            style={{
              ...(theme === 'dark' && {
                opacity: 0.8,
              })
            }}
            onMouseEnter={(e) => {
              if (theme === 'dark') {
                e.currentTarget.style.opacity = '1';
              }
            }}
            onMouseLeave={(e) => {
              if (theme === 'dark') {
                e.currentTarget.style.opacity = '0.8';
              }
            }}
          >
            <img
              src={theme === 'light' ? "/images/logo-horizontal.svg": '/images/turbotic-logo.png'}
              alt="Turbotic Logo"
              className="h-8 w-auto block"
            />
          </Link>
        )}
        <span id="dynamic-content"></span>
      </div>
      <div className="flex items-center gap-4">
        {/* Theme Switcher */}
        <Button
          // type="text"
          shape="circle"
          icon={theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          onClick={toggleTheme}
          className="theme-switcher"
        />
        
        {hasInitialised && (
          currentUser ? (
            <UserMenu />
          ) : (
            <div className="flex items-center gap-2">
              <Button
                shape="round"
                type="text"
                onClick={() => {
                  getCurrentUser(true);
                }}
              >
                Sign up
              </Button>
              <Button
                shape="round"
                type="primary"
                onClick={() => {
                  getCurrentUser(true);
                }}
              >
                Log in
              </Button>
            </div>
          )
        )}
      </div>
    </header>
  );
};

export { Header };
