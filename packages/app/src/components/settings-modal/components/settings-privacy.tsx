"use client";
import React from "react";
import { useAuth } from "@/app/authentication";
import { App, Button, Card, Form, Switch, Typography, Space, Spin, Divider, Alert } from "antd";
import { SafetyOutlined, LockOutlined, EyeOutlined, KeyOutlined } from "@ant-design/icons";
import { useEffect, useState, useCallback } from "react";
import { AnalyticsSettings, useAnalyticsSettingsVisibility } from "@/components/AnalyticsSettings";

interface PrivacySettings {
  dataCollection: boolean;
  analytics: boolean;
  errorReporting: boolean;
  sessionTimeout: number;
  twoFactorAuth: boolean;
  loginNotifications: boolean;
}

const SettingsPrivacy = () => {
  const { currentUser } = useAuth();
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { shouldShow: showAnalyticsSettings, loading: analyticsSettingsLoading } = useAnalyticsSettingsVisibility();

  // Remove analytics field from form when it shouldn't be shown
  useEffect(() => {
    if (!analyticsSettingsLoading && !showAnalyticsSettings) {
      const currentValues = form.getFieldsValue();
      if ('analytics' in currentValues) {
        form.setFieldsValue({ analytics: undefined });
        form.resetFields(['analytics']);
      }
    }
  }, [analyticsSettingsLoading, showAnalyticsSettings, form]);

  const t = (s: string, text: string) => text;

  const loadPrivacySettings = useCallback(async () => {
    if (!currentUser?.email) return;

    setLoading(true);
    try {
      const response = await fetch("/api/user/privacy", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const defaultValues: any = {
          dataCollection: true,
          errorReporting: true,
          sessionTimeout: 30,
          twoFactorAuth: false,
          loginNotifications: true,
        };
        
        // Get settings from API response, but filter out analytics if it shouldn't be shown
        const apiSettings = data.settings || {};
        const formValues: any = { ...defaultValues };
        
        // Copy all fields from API except analytics (if it shouldn't be shown)
        Object.keys(apiSettings).forEach(key => {
          if (key === 'analytics') {
            // Only include analytics if settings panel is enabled
            if (!analyticsSettingsLoading && showAnalyticsSettings) {
              formValues[key] = apiSettings[key];
            }
          } else {
            formValues[key] = apiSettings[key];
          }
        });
        
        // Only add analytics default if it should be shown and wasn't in API response
        if (!analyticsSettingsLoading && showAnalyticsSettings && !('analytics' in apiSettings)) {
          formValues.analytics = true;
        }
        
        form.setFieldsValue(formValues);
      } else {
        // Set default values if no settings found
        const defaultValues: any = {
          dataCollection: true,
          errorReporting: true,
          sessionTimeout: 30,
          twoFactorAuth: false,
          loginNotifications: true,
        };
        // Only include analytics field if settings panel is enabled
        if (!analyticsSettingsLoading && showAnalyticsSettings) {
          defaultValues.analytics = true;
        }
        form.setFieldsValue(defaultValues);
      }
    } catch (error) {
      console.error("Error loading privacy settings:", error);
      messageApi.error("Failed to load privacy settings");
    } finally {
      setLoading(false);
    }
  }, [currentUser, analyticsSettingsLoading, showAnalyticsSettings, form, messageApi]);

  useEffect(() => {
    if (!analyticsSettingsLoading) {
      loadPrivacySettings();
    }
  }, [analyticsSettingsLoading, showAnalyticsSettings, loadPrivacySettings]);

  const handleSave = async (values: PrivacySettings) => {
    setSaving(true);
    try {
      const response = await fetch("/api/user/privacy", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings: values }),
      });

      if (response.ok) {
        messageApi.success("Privacy settings updated successfully");
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to update privacy settings");
      }
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      messageApi.error("Failed to update privacy settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-privacy-container">
      <div className="title">
        {t("settingsModal.tabs.privacy", "Privacy & Security")}
      </div>

      <Spin spinning={loading}>
        <Card>
          <div style={{ marginBottom: 24 }}>
            <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
              Control your privacy settings and security preferences to keep your account safe and secure.
            </Typography.Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            style={{ maxWidth: 600 }}
          >
            <div style={{ marginBottom: 32 }}>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>
                <SafetyOutlined style={{ marginRight: 8 }} />
                Data & Privacy
              </Typography.Title>
              
              <Form.Item
                name="dataCollection"
                valuePropName="checked"
                style={{ marginBottom: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Typography.Text strong>Data Collection</Typography.Text>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                        Allow collection of usage data to improve the platform
                      </Typography.Text>
                    </div>
                  </div>
                  <Switch />
                </div>
              </Form.Item>

              {/* Hide Analytics toggle when Google Analytics settings panel is disabled */}
              {!analyticsSettingsLoading && showAnalyticsSettings && (
                <Form.Item
                  name="analytics"
                  valuePropName="checked"
                  style={{ marginBottom: 16 }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Typography.Text strong>Analytics</Typography.Text>
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                          Help us understand how you use the platform
                        </Typography.Text>
                      </div>
                    </div>
                    <Switch />
                  </div>
                </Form.Item>
              )}

              <Form.Item
                name="errorReporting"
                valuePropName="checked"
                style={{ marginBottom: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Typography.Text strong>Error Reporting</Typography.Text>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                        Automatically report errors to help improve stability
                      </Typography.Text>
                    </div>
                  </div>
                  <Switch />
                </div>
              </Form.Item>
            </div>

            {/* Google Analytics Settings - Only shows if configured by admin */}
            {!analyticsSettingsLoading && showAnalyticsSettings && (
              <>
                <AnalyticsSettings />
                <Divider />
              </>
            )}

            <div style={{ marginBottom: 32 }}>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>
                <LockOutlined style={{ marginRight: 8 }} />
                Security
              </Typography.Title>
              
              <Form.Item
                name="twoFactorAuth"
                valuePropName="checked"
                style={{ marginBottom: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Typography.Text strong>Two-Factor Authentication</Typography.Text>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                        Add an extra layer of security to your account
                      </Typography.Text>
                    </div>
                  </div>
                  <Switch />
                </div>
              </Form.Item>

              <Form.Item
                name="loginNotifications"
                valuePropName="checked"
                style={{ marginBottom: 16 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <Typography.Text strong>Login Notifications</Typography.Text>
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                        Get notified when someone logs into your account
                      </Typography.Text>
                    </div>
                  </div>
                  <Switch />
                </div>
              </Form.Item>
            </div>

            <Divider />

            <div style={{ marginBottom: 32 }}>
              <Typography.Title level={5} style={{ marginBottom: 16 }}>
                <KeyOutlined style={{ marginRight: 8 }} />
                Session Management
              </Typography.Title>
              
              <Alert
                message="Session Timeout"
                description="Your session will automatically expire after the specified number of minutes of inactivity."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            </div>

            <Form.Item style={{ marginBottom: 0, marginTop: 32 }}>
              <Space>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  icon={<SafetyOutlined />}
                  loading={saving}
                  size="large"
                >
                  Save Settings
                </Button>
                <Button 
                  onClick={() => form.resetFields()}
                  size="large"
                >
                  Reset
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Spin>
    </div>
  );
};

export default SettingsPrivacy;
