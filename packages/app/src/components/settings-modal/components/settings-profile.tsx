"use client";
import React from "react";
import { useAuth } from "@/app/authentication";
import { App, Button, Card, Form, Input, Space, Spin, Typography, Avatar } from "antd";
import { UserOutlined, CameraOutlined, SaveOutlined } from "@ant-design/icons";
import { useEffect, useState, useRef } from "react";
import { AvatarCropModal } from "./avatar-crop-modal";

const SettingsProfile = () => {
  const { currentUser } = useAuth();
  const { message: messageApi } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = (s: string, text: string) => text;

  useEffect(() => {
    if (currentUser) {
      form.setFieldsValue({
        name: currentUser.name || '',
        email: currentUser.email || '',
      });
    }
  }, [currentUser, form]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      // First update the profile (name)
      const profileResponse = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!profileResponse.ok) {
        const error = await profileResponse.json();
        throw new Error(error.error || "Failed to update profile");
      }

      // Then upload avatar if one was selected
      if (selectedAvatar) {
        const avatarResponse = await fetch("/api/user/avatar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ avatarDataUrl: selectedAvatar }),
        });

        if (!avatarResponse.ok) {
          const errorData = await avatarResponse.json();
          const errorMessage = errorData.error || "Failed to update avatar";
          // Show specific error message to user
          messageApi.error(errorMessage);
          setSelectedAvatar(null); // Clear invalid avatar
          throw new Error(errorMessage);
        }
      }

      messageApi.success("Profile updated successfully");
      // Clear selected avatar and refresh user data
      setSelectedAvatar(null);
      window.location.reload();
    } catch (error) {
      console.error("Error updating profile:", error);
      // Error message for avatar is already shown above, only show message for other profile errors
      const errorMessage = error instanceof Error ? error.message : "Failed to update profile";
      const isAvatarError = errorMessage.includes('avatar') || errorMessage.includes('image') || errorMessage.includes('File') || errorMessage.includes('executable') || errorMessage.includes('archive');
      if (!isAvatarError) {
        messageApi.error(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const validateAvatarFile = (file: File): string | null => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return `File type '${file.type}' is not allowed. Please select an image file (JPEG, PNG, GIF, WebP, or SVG).`;
    }

    // Check file size (5MB limit)
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSizeBytes) {
      return 'File size exceeds 5MB limit. Please select a smaller image.';
    }

    // Additional checks for suspicious file extensions
    const fileName = file.name.toLowerCase();
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.zip', '.rar', '.7z', '.tar', '.gz'];
    for (const ext of suspiciousExtensions) {
      if (fileName.endsWith(ext)) {
        return 'Executable and archive files are not allowed. Please select an image file.';
      }
    }

    return null; // File is valid
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      // Validate file before processing
      const validationError = validateAvatarFile(file);
      if (validationError) {
        messageApi.error(validationError);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Read the file and show crop modal
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImageToCrop(dataUrl);
        setCropModalVisible(true);
      };
      reader.onerror = () => {
        messageApi.error('Failed to read the selected file. Please try again.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing avatar:", error);
      messageApi.error('Failed to process avatar. Please try again.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCropSave = (croppedDataUrl: string) => {
    setSelectedAvatar(croppedDataUrl);
    setCropModalVisible(false);
    setImageToCrop(null);
    messageApi.success('Avatar selected. Click "Save Changes" to update.');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    setCropModalVisible(false);
    setImageToCrop(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarUpload(file);
    }
  };

  const handleAvatarButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    form.resetFields();
    setSelectedAvatar(null);
  };

  return (
    <div className="settings-profile-container">
      <div className="title">
        {t("settingsModal.tabs.profile", "Profile")}
      </div>

      <Spin spinning={loading}>
        <Card>
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 32 }}>
              <Avatar
                key={selectedAvatar || currentUser?.avatarDataUrl || 'default'}
                size={80}
                icon={<UserOutlined />}
                src={selectedAvatar || currentUser?.avatarDataUrl}
                style={{ backgroundColor: '#1890ff' }}
              />
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {currentUser?.name || 'User'}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {currentUser?.email}
                </Typography.Text>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Button 
                    icon={<CameraOutlined />} 
                    size="small"
                    onClick={handleAvatarButtonClick}
                    type={selectedAvatar ? "primary" : "default"}
                  >
                    {selectedAvatar ? "Avatar Selected" : "Change Avatar"}
                  </Button>
                  {selectedAvatar && (
                    <Button 
                      size="small"
                      onClick={handleAvatarButtonClick}
                    >
                      Change Again
                    </Button>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                  />
                </div>
                {selectedAvatar && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                    Avatar ready. Click "Save Changes" to apply.
                  </Typography.Text>
                )}
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSave}
              style={{ maxWidth: 500 }}
            >
              <Form.Item
                name="name"
                label="Display Name"
                rules={[
                  { required: true, message: "Please enter your name" },
                  { max: 50, message: "Name must be less than 50 characters" }
                ]}
              >
                <Input 
                  placeholder="Enter your display name"
                  prefix={<UserOutlined />}
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="email"
                label="Email Address"
                rules={[
                  { required: true, message: "Please enter your email" },
                  { type: "email", message: "Please enter a valid email" }
                ]}
                extra="This email is used for authentication and notifications"
              >
                <Input 
                  placeholder="Enter your email address"
                  prefix={<UserOutlined />}
                  size="large"
                  disabled
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, marginTop: 32 }}>
                <Space>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    icon={<SaveOutlined />}
                    loading={saving}
                    size="large"
                  >
                    Save Changes
                  </Button>
                  <Button
                    onClick={handleReset}
                    size="large"
                  >
                    Reset
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        </Card>
      </Spin>

      <AvatarCropModal
        visible={cropModalVisible}
        imageSrc={imageToCrop || ''}
        onCancel={handleCropCancel}
        onSave={handleCropSave}
      />
    </div>
  );
};

export default SettingsProfile;
