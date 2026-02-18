import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Shield, Users, X, Crown, Plus } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/components/ui/toasts';

interface AdminUser {
  _id: string;
  email: string;
}

interface AdminManagementDialogProps {
  automationId: string;
  automationTitle: string;
  trigger?: React.ReactNode;
  canManageAdmins?: boolean;
  adminUserIds?: string[];
  currentUserId?: string;
}

export const AdminManagementDialog = ({ 
  automationId, 
  automationTitle, 
  trigger,
  canManageAdmins = false,
  adminUserIds = [],
  currentUserId = ''
}: AdminManagementDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [originalAdminEmails, setOriginalAdminEmails] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  // Check if current user is an admin based on adminUserIds
  const isCurrentUserAdmin = currentUserId && adminUserIds.includes(currentUserId);

  const loadCurrentAdmins = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/automations/${automationId}/admins`);
      const data = await response.json();
      if (response.ok) {
        const emails = data.adminUsers?.map((admin: AdminUser) => admin.email) || [];
        setAdminEmails(emails);
        setOriginalAdminEmails(emails);
        setIsOwner(data.isOwner || false);
        setIsAdmin(data.isAdmin || false);
        setHasPermission(true);
      } else {
        // If we get an access denied error, user doesn't have permission
        if (response.status === 403) {
          setHasPermission(false);
          setIsOpen(false); // Close the dialog
          showErrorToast('You do not have permission to manage admin users');
        } else {
          showErrorToast(data.error || 'Failed to load admin users');
        }
      }
    } catch (error) {
      console.error('Error loading admin users:', error);
      showErrorToast('Failed to load admin users');
      setHasPermission(false);
      setIsOpen(false); // Close the dialog
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!hasPermission) {
      showErrorToast('You do not have permission to manage admin users');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/automations/${automationId}/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminEmails: adminEmails.join(',')
        })
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast('Admin users updated successfully');
        setOriginalAdminEmails([...adminEmails]);
        setIsOpen(false);
      } else {
        showErrorToast(data.error || 'Failed to update admin users');
      }
    } catch (error) {
      console.error('Error updating admin users:', error);
      showErrorToast('Failed to update admin users');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    // Only allow opening if user is an admin
    if (open && !isCurrentUserAdmin) {
      showErrorToast('Only admins can manage admin users');
      return;
    }
    
    setIsOpen(open);
    if (open) {
      loadCurrentAdmins();
    } else {
      setAdminEmails([]);
      setAdminEmailInput('');
      setHasPermission(false);
    }
  };

  const addAdminEmail = () => {
    const email = adminEmailInput.trim();
    if (email && !adminEmails.includes(email)) {
      setAdminEmails([...adminEmails, email]);
      setAdminEmailInput('');
    }
  };

  const removeAdminEmail = (email: string) => {
    setAdminEmails(adminEmails.filter(e => e !== email));
  };

  const hasChanges = JSON.stringify(adminEmails) !== JSON.stringify(originalAdminEmails);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            disabled={!isCurrentUserAdmin}
          >
            <Shield className="w-4 h-4 mr-1" />
            Manage Admins
          </Button>
        )}
      </DialogTrigger>
      <DialogContent 
        className="w-full max-w-lg mx-4 p-6 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-xl"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900 dark:text-white">
            <div className="flex items-center justify-center w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            Manage Automation Admins
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Automation Info */}
          <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <Label className="text-sm font-medium text-black dark:text-white mb-2">
              Automation
            </Label>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-medium text-gray-900 dark:text-white text-sm leading-tight">
                  {automationTitle}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Admins can manage, edit, and delete this automation and its shares
                </p>
              </div>
              <div className="flex items-center gap-1">
                {isOwner && (
                  <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">
                    <Crown className="w-2 h-2 mr-1" />
                    Owner
                  </Badge>
                )}
                {isAdmin && !isOwner && (
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
                    <Shield className="w-2 h-2 mr-1" />
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading admin information...</div>
            </div>
          )}

          {/* Current Admins - Show for all admins */}
          {!isLoading && isCurrentUserAdmin && adminEmails.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Current Admins
              </Label>
              <div className="space-y-2">
                {adminEmails.map((admin) => (
                  <div key={admin} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
                        <Shield className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {admin}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin Emails Input - Only show for admins with permission */}
          {!isLoading && hasPermission && (
            <div className="space-y-3">
              <Label htmlFor="admin-emails" className="text-sm font-medium text-black dark:text-white">
                Admin Emails
              </Label>
              <div className="flex flex-wrap items-center gap-2 min-h-[44px]">
                {adminEmails.map(e => (
                  <span key={e} className="bg-yellow-100 text-black dark:text-gray-900 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                    {e}
                    <button type="button" onClick={() => removeAdminEmail(e)} className="ml-1 focus:outline-none">
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <input
                  id="admin-emails"
                  type="email"
                  placeholder="Enter admin email"
                  value={adminEmailInput}
                  onChange={e => setAdminEmailInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAdminEmail();
                    }
                  }}
                  className="flex-1 min-w-[120px] bg-transparent border border-gray-300 rounded px-3 py-2 outline-none text-base text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-300"
                  style={{ fontSize: '16px' }}
                />
                <Button
                  type="button"
                  onClick={addAdminEmail}
                  disabled={!adminEmailInput.trim() || adminEmails.includes(adminEmailInput.trim())}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded"
                >
                  <Plus className="w-4 h-4" />
                  <span className="ml-1">Add</span>
                </Button>
              </div>
              <p className="text-xs text-black dark:text-white mt-2">
                Only the automation owner or existing admins can manage admin users.
              </p>
            </div>
          )}

          {/* Action Buttons - Only show for admins with permission */}
          {!isLoading && hasPermission && (
            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || isLoading || !hasChanges}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-700"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSaving}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}; 