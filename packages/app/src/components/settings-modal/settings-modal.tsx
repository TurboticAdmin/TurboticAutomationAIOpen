"use client";
import React from "react";
import { Menu, MenuProps, Modal } from "antd";
import { useEffect, useState } from "react";
import SettingsIntegrations from "./components/settings-integrations";
import SettingsUserConfigurations from "./components/settings-user-configurations";
import SettingsProfile from "./components/settings-profile";
import SettingsPrivacy from "./components/settings-privacy";
import { Plug2, Settings, User, Lock } from "lucide-react";
import { useSearchParams } from 'next/navigation';
import { useAnalyticsSettingsVisibility } from '@/components/AnalyticsSettings';

import "./settings-modal.scss";

type MenuItem = Required<MenuProps>["items"][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  onClick?: any
): MenuItem {
  return {
    key,
    icon,
    label,
    onClick: onClick,
  } as MenuItem;
}

const SettingsModal = ({
  open,
  tab,
  subTab,
  handleClose,
}: {
  open: boolean;
  tab: string;
  subTab?: string;
  handleClose: () => void;
}) => {
  const [currentTab, setCurrentTab] = useState("profile");
  
  // Check if Privacy & Security tab should be shown
  const { shouldShow: showPrivacyTab, loading: privacyTabLoading } = useAnalyticsSettingsVisibility();

  // Build menu items conditionally - only show Privacy & Security if showSettingsPanel is true
  const baseItems = [
    getItem("Profile", "profile", <User />, (e: any) => {
      setCurrentTab(e.key);
    }),
    getItem("Integrations", "integrations", <Plug2 />, (e: any) => {
      setCurrentTab(e.key);
    }),
    getItem("User Configurations", "user-configurations", <Settings />, (e: any) => {
      setCurrentTab(e.key);
    }),
  ];

  // Only add Privacy & Security tab if showSettingsPanel is true
  const privacyItem = !privacyTabLoading && showPrivacyTab
    ? getItem("Privacy & Security", "privacy", <Lock />, (e: any) => {
        setCurrentTab(e.key);
      })
    : null;

  const items = [
    ...baseItems,
    ...(privacyItem ? [privacyItem] : []),
  ];

  useEffect(() => {
    if (tab) {
      setCurrentTab(tab)
    }
  }, [tab]);

  // If privacy tab is hidden but user is on it, redirect to profile
  useEffect(() => {
    if (!privacyTabLoading && !showPrivacyTab && currentTab === "privacy") {
      setCurrentTab("profile");
    }
  }, [privacyTabLoading, showPrivacyTab, currentTab]);

  return (
    <>
      <Modal
        className="settings-modal"
        open={open}
        wrapClassName="settings-modal-wrapper"
        footer={null}
        onCancel={handleClose}
        destroyOnHidden
      >
        <div className="flex h-full flex-nowrap">
          <Menu
            mode="inline"
            defaultSelectedKeys={["profile"]}
            items={items}
            key="settings-sider-menu"
            className="settings-sider-menu"
            selectedKeys={[currentTab]}
            inlineCollapsed={false}
            triggerSubMenuAction="click"
          />
          <div className="flex-auto content">
            <div className="content-wrapper">
              {currentTab === "profile" && <SettingsProfile />}
              {currentTab === "integrations" && <SettingsIntegrations />}
              {currentTab === "user-configurations" && <SettingsUserConfigurations />}
              {/* Only render Privacy tab if showSettingsPanel is true */}
              {currentTab === "privacy" && !privacyTabLoading && showPrivacyTab && <SettingsPrivacy />}
           </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SettingsModal;
