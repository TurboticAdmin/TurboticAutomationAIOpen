"use client";
import { useAuth } from '@/app/authentication';
import { Button } from 'antd';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvatarCropModal } from '@/components/settings-modal/components/avatar-crop-modal';

function getInitials(user: any) {
  if (user?.name) return user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  if (user?.email) return user.email[0].toUpperCase();
  return '?';
}

export function UserMenu() {
  const { currentUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  const handleAvatarClick = () => {
    // Navigate to settings modal with profile tab, staying on current page
    const currentPath = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('settingsModal', 'profile');
    router.push(`${currentPath}?${searchParams.toString()}`);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Security: Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please select an image file (JPEG, PNG, GIF, or WebP).');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      // Security: Check file size (5MB limit)
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        alert('File size exceeds 5MB limit. Please select a smaller image.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Read the file and show crop modal
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImageToCrop(dataUrl);
        setCropModalVisible(true);
      };
      reader.onerror = () => {
        alert('Failed to read the selected file. Please try again.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropSave = async (croppedDataUrl: string) => {
    setCropModalVisible(false);
    setImageToCrop(null);
    
    try {
      const response = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarDataUrl: croppedDataUrl }),
      });
      
      if (response.ok) {
        window.location.reload();
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to update avatar';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    }
    
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

  if (!currentUser) return null;

  return (
    <div className="flex items-center gap-2">
      <Button onClick={logout} type="text"> 
        Logout
      </Button>
      <div
        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm cursor-pointer overflow-hidden"
        title={currentUser.name || currentUser.email}
        onClick={handleAvatarClick}
      >
        {currentUser.avatarDataUrl ? (
          <img src={currentUser.avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          getInitials(currentUser)
        )}
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleAvatarChange}
        />
      </div>
      {/* <button
        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
        onClick={logout}
      >
        Logout
      </button> */}

      <AvatarCropModal
        visible={cropModalVisible}
        imageSrc={imageToCrop || ''}
        onCancel={handleCropCancel}
        onSave={handleCropSave}
      />
    </div>
  );
} 