"use client";
import React from "react";
import { toast } from '@/hooks/use-toast';
import { MoreOutlined, QuestionCircleOutlined, UserOutlined, ApiOutlined, SettingOutlined } from "@ant-design/icons";
import {
  App,
  Dropdown,
  Layout,
  Menu,
  MenuProps,
} from "antd";

// Type assertions to fix React compatibility issues
const AntApp = App as any;
const AntDropdown = Dropdown;
const AntLayout = Layout as any;
const AntMenu = Menu;
import Link from "next/link";
import { createElement, useEffect, useMemo, useState } from "react";
import {
  AutomationIcon,
  CaretDoubleDownIcon,
  HomeIcon,
  FileIcon,
} from "./CustomIcons";
import { useAuth } from "@/app/authentication";
import { usePathname, useRouter } from "next/navigation";
import SettingsModal from "./settings-modal/settings-modal";

const { Sider } = AntLayout;

type MenuItem = Required<MenuProps>["items"][number];

const sidebarWidth = "290px";

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
  href?: string,
  type?: "group" | "custom" | "dummy",
  onClick?: any,
  className?: string
): any {
  return {
    key,
    icon,
    children,
    label: (createElement as any)(() => {
      if (type === "dummy") {
        return null as any;
      }
      if (type === "group") {
        return <>{label}</> as any;
      } else if (type === "custom") {
        return <div>{label}</div> as any;
      }

      return (
        <Link className={className} href={href || "/"}>
          {label as any}
        </Link>
      ) as any;
      // return (
      //     <div className={className} onClick={onClick}>
      //         {label}
      //     </div>
      // );
    }) as any,
    type,
    className: type === "dummy" ? "dummy" : undefined,
  } as any;
}

const redirectURI = (newSearchParams: any) => {
  let query = "";

  if (newSearchParams.toString()?.length > 0) {
    query = "?" + newSearchParams.toString();
  }

  const newUrl = window.location.pathname + query;
  window.history.replaceState(null, "", newUrl);
};

const Sidebar = () => {
  const [sideBarCollapsed, setSideBarCollapsed] = useState(true);
  const [settingsModalState, setSettingsModalState] = useState<{
    open: boolean;
    tab: string;
    subTab?: string;
  }>({
    open: false,
    tab: "",
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const { isAuthenticated } = useAuth();


  // Disable tooltips when dropdown is open
  useEffect(() => {
    if (dropdownOpen) {
      // Hide all tooltips globally
      const tooltips = document.querySelectorAll('.ant-tooltip');
      tooltips.forEach(tooltip => {
        (tooltip as HTMLElement).style.display = 'none';
        (tooltip as HTMLElement).style.visibility = 'hidden';
        (tooltip as HTMLElement).style.opacity = '0';
      });
      
      // Add global style to prevent new tooltips
      const style = document.createElement('style');
      style.id = 'disable-tooltips';
      style.textContent = '.ant-tooltip { display: none !important; visibility: hidden !important; opacity: 0 !important; }';
      document.head.appendChild(style);
    } else {
      // Remove the global style when dropdown closes
      const style = document.getElementById('disable-tooltips');
      if (style) {
        style.remove();
      }
    }
  }, [dropdownOpen]);
  
  const items = [
    getItem(
      "Home",
      "home",
      <HomeIcon />,
      undefined,
      "/",
      undefined,
      () => {},
      "home"
    ),
    getItem(
      "Automations",
      "automations",
      <AutomationIcon />,
      undefined,
      "/automations",
      undefined,
      () => {},
      "automations"
    ),
    getItem(
      "Files",
      "files",
      <FileIcon />,
      undefined,
      "/files",
      undefined,
      () => {},
      "files"
    ),
    getItem(
      "FAQ",
      "faq",
      <QuestionCircleOutlined />,
      undefined,
      "/faq",
      undefined,
      () => {},
      "faq"
    ),
    getItem(
      undefined,
      "dummy",
      false,
      undefined,
      undefined,
      "dummy",
      () => {},
      "dummy"
    ),
  ];

  const router = useRouter();
  const pathname = usePathname();

  // Listen for custom event to open settings modal from landing page
  useEffect(() => {
    const handleOpenSettingsModal = (event: CustomEvent) => {
      const { tab, subTab } = event.detail;
      setSettingsModalState({
        open: true,
        tab: tab || '',
        subTab: subTab
      });
    };

    window.addEventListener('openSettingsModal' as any, handleOpenSettingsModal as any);

    return () => {
      window.removeEventListener('openSettingsModal' as any, handleOpenSettingsModal as any);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    
    let lastUrl = window.location.href;
    let hasProcessedTab = false;
    
    const checkUrlParams = () => {
      // Use window.location.search directly to avoid Suspense requirement with useSearchParams
      const currentUrl = window.location.href;
      const searchParams = new URLSearchParams(window.location.search);
      const tab = searchParams.get("settingsModal");
      const subTab = searchParams.get("tab");
      const stripeReturn = searchParams.get("stripe_return");
      const sessionId = searchParams.get("session_id");
      
      // Check for settings modal parameter
      if (tab && !hasProcessedTab) {
        const successMessage = searchParams.get("message");
        const errorMessage = searchParams.get("error");
        setSettingsModalState({
          open: true,
          tab: tab,
          subTab: subTab || undefined,
        });
        if (successMessage) {
          toast.success(successMessage);
        }
        if (errorMessage) {
          toast.error("Error",errorMessage);
        }

        const params = new URLSearchParams(window.location.search);
        params.delete("settingsModal");
        params.delete("message");
        params.delete("error");
        // Keep the tab parameter until SettingsBilling reads it
        if (subTab) {
          // Don't delete tab yet - let SettingsBilling component handle it
        } else {
          params.delete("tab");
        }
        redirectURI(params);
        hasProcessedTab = true;
      } else if (!tab && hasProcessedTab) {
        // Reset flag when tab parameter is removed
        hasProcessedTab = false;
      }
      
      // Track URL changes
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        hasProcessedTab = false; // Reset when URL changes
      }
      
      // Handle return from Stripe checkout (removed - subscription functionality removed)
      if (stripeReturn === 'success' || stripeReturn === 'cancel') {
        // Subscription functionality removed - just clean up URL params
        const params = new URLSearchParams(window.location.search);
        params.delete("stripe_return");
        params.delete("session_id");
        redirectURI(params);
      }
    };

    // Check immediately
    checkUrlParams();
    
    // Listen for URL changes (popstate events from browser navigation)
    const handlePopState = () => {
      lastUrl = window.location.href;
      checkUrlParams();
    };
    
    // Also check periodically in case URL changes via router.push (not triggering popstate)
    const intervalId = setInterval(() => {
      checkUrlParams();
    }, 150);
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(intervalId);
    };
  }, [isAuthenticated, pathname]);

  const selectedKeys = useMemo(() => {
    const path = pathname.split("/");
    const lastPath = path[path.length - 1];

    // Handle files sub-routes
    if (pathname.startsWith("/meetings")) {
      return ["meetings"];
    }

    if (lastPath) {
      return [lastPath];
    }
    return ["home"];
  }, [pathname]);


  // No longer needed - My Meetings is now a top-level menu item

  const hideSidebar = useMemo(() => {
    if (!isAuthenticated) return true;
    if (pathname.includes("/canvas")) return true;
  }, [isAuthenticated, pathname]);

  const settingsMenu = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Profile",
      onClick: () => {
        setSettingsModalState({
          open: true,
          tab: 'profile',
        });
      },
    },
    {
      key: "integrations",
      icon: <ApiOutlined />,
      label: "Integrations",
      onClick: () => {
        setSettingsModalState({
          open: true,
          tab: 'integrations',
        });
      },
    },
    {
      key: "user-configurations",
      icon: <SettingOutlined />,
      label: "User Configurations",
      onClick: () => {
        setSettingsModalState({
          open: true,
          tab: 'user-configurations',
        });
      },
    },
  ];

  useEffect(() => {
    const collapsed = localStorage.getItem("sidebar-collapsed");
    if (hideSidebar) {
      document.documentElement.style.setProperty("--sidebar-width", "0px");
    } else {
      const isSmallScreen = window.innerWidth < 1300;
      if (collapsed !== undefined && collapsed !== null) {
        setSideBarCollapsed(collapsed === "true");
        document.documentElement.style.setProperty(
          "--sidebar-width",
          collapsed === "true" ? "80px" : sidebarWidth
        );
      } else if (isSmallScreen) {
        setSideBarCollapsed(true);
        document.documentElement.style.setProperty("--sidebar-width", "80px");
      } else {
        setSideBarCollapsed(false);
        document.documentElement.style.setProperty("--sidebar-width", sidebarWidth);
      }
    }
    return () => {
      document.documentElement.style.setProperty("--sidebar-width", "0px");
    };
  }, [hideSidebar]);

  const toggleSidebar = (collapsed: boolean) => {
    setSideBarCollapsed(collapsed);
    localStorage.setItem("sidebar-collapsed", collapsed ? "true" : "false");
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "80px" : sidebarWidth
    );
  };

  if (hideSidebar) {
    return (
      <>
        {isAuthenticated && <SettingsModal
          open={settingsModalState.open}
          handleClose={() => {
            setSettingsModalState({
              open: false,
              tab: '',
            });
          }}
          tab={settingsModalState.tab}
          subTab={settingsModalState.subTab}
        />}
      </>
    );
  }

  return (
    <Sider
      trigger={null}
      collapsible
      width={sidebarWidth}
      collapsed={sideBarCollapsed}
      className="left-sider"
      key="left-sider"
      theme="light"
      onCollapse={(collapsed: boolean) => {
        toggleSidebar(collapsed);
      }}
    >
      <div>
        {!sideBarCollapsed && (
          <div className="flex items-center justify-between ml-[36px] mr-[20px]">
            <Link href="/">
              <img
                src="/images/logo-horizontal.svg"
                alt="Turbotic Logo"
                className="h-8 w-auto block dark:hidden"
              />
              <img
                src="/images/turbotic-logo.png"
                alt="Turbotic Logo"
                className="h-8 w-auto hidden dark:block"
              />
            </Link>
            <CaretDoubleDownIcon
              className="cursor-pointer"
              onClick={() => {
                toggleSidebar(!sideBarCollapsed);
              }}
            />
          </div>
        )}
        {sideBarCollapsed && (
          <div className="ml-[20px] flex items-center">
            <div
              className="cursor-pointer"
              onClick={() => {
                toggleSidebar(!sideBarCollapsed);
              }}
            >
              <img
                src="/images/logo-mark-blue.png"
                alt="Turbotic Logo"
                className="h-8 w-8 block dark:hidden"
              />
              <img
                src="/images/logo-mark-white.png"
                alt="Turbotic Logo"
                className="h-8 w-8 hidden dark:block"
              />
            </div>
          </div>
        )}
      </div>
      <AntMenu
        selectedKeys={
          selectedKeys?.[0] === "chat-win" ? ["new-chat"] : selectedKeys
        }
        openKeys={openKeys}
        onOpenChange={(keys: string[]) => setOpenKeys(keys)}
        mode="inline"
        theme="light"
        items={items}
      />
      <div
        style={{
          width: !sideBarCollapsed ? sidebarWidth : parseInt(sidebarWidth) - 1,
        }}
        className="settings-menu"
      >
        <AntDropdown
          // trigger={["click"]}
          // open={dropdownOpen}
          // onOpenChange={setDropdownOpen}
          // menu={{
          //   items: settingsMenu.map(item => ({
          //     ...item,
          //     title: undefined, // Remove any title attributes that might trigger tooltips
          //   })),
          // }}
          // overlayStyle={{ 
          //   minWidth: 200,
          //   maxWidth: 250,
          //   whiteSpace: 'nowrap'
          // }}
          // popupRender={(menu) => (
          //   <div 
          //     className="settings-dropdown-menu"
          //     style={{ 
          //       minWidth: 200,
          //       maxWidth: 250,
          //       whiteSpace: 'nowrap',
          //       fontSize: '14px'
          //     }}
          //   >
          //     {menu}
          //   </div>
          // )}
          // align={{
          //   offset: sideBarCollapsed ? [10, -35] : [35, -50],
          // }}
          // placement={sideBarCollapsed ? "bottomRight" : "topRight"}
          // destroyOnHidden={true}
          // overlayClassName="settings-dropdown-overlay"
          trigger={["click"]}
          menu={{
            items: settingsMenu,
          }}
          overlayStyle={{ minWidth: 230 }}
          align={{
            offset: sideBarCollapsed ? [0, -35] : [35, -50],
          }}
        >
          {sideBarCollapsed ? (
            <MoreOutlined
              rotate={90}
              style={{ padding: "24px", fontSize: 20 }}
            />
          ) : (
            <div className="flex items-center justify-between py-2 pl-[40px] pr-[24px] cursor-pointer">
              <div>Settings</div>
              <MoreOutlined rotate={90} style={{ fontSize: 20 }} />
            </div>
          )}
        </AntDropdown>
      </div>
      <SettingsModal
        {...settingsModalState}
        handleClose={() => {
          setSettingsModalState({
            open: false,
            tab: '',
          });
        }}
      />
    </Sider>
  );
};

export default Sidebar;
