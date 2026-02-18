"use client";

import { CaretRightFilled } from "@ant-design/icons";
import { toast } from '@/hooks/use-toast';
import { Button, Tooltip, Typography, Switch, message, Modal, Select, Checkbox, Divider, Input } from "antd";
import { EyeIcon, Trash2, Clock, Play, Pause, Copy, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "@ant-design/v5-patch-for-react-19";
import { useState, useEffect } from "react";
import { useAuth } from "@/app/authentication";

interface Schedule {
  _id: string;
  automationId: string;
  automationTitle: string;
  cronExpression: string;
  cronExpressionFriendly: string;
  mode: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  triggerEnabled?: boolean;
  runtimeEnvironment?: 'dev' | 'test' | 'production';
  scheduleDescription?: string;
  emailNotificationsEnabled?: boolean;
  emailOnCompleted?: boolean;
  emailOnFailed?: boolean;
}

interface ScheduleWithRunInfo extends Schedule {
  nextRun?: Date;
  previousRun?: Date;
}

interface ScheduleCardProps {
  schedule: Schedule;
  onRun?: (automationId: string) => void;
  onToggleStatus?: (automationId: string, enabled: boolean) => void;
  onClone?: (automation: { id: string; title: string }) => void;
  onUpdate?: () => void; // Callback to refresh schedules after update
  //   onEdit?: (automationId: string) => void;
  //   onConfigure?: (automationId: string) => void;
  //   onDelete?: (automationId: string, automationTitle: string) => void;
  // isSelected?: boolean;
  // onSelectionChange?: (automationId: string, selected: boolean) => void;
  // showSelection?: boolean;
  // checkboxSize?: "sm" | "md" | "lg" | "small" | "normal";
}

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  SEK: "kr",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "Fr.",
  CNY: "¥",
  INR: "₹",
};

const ScheduleCard = ({
  schedule,
  onRun,
  onToggleStatus,
  onClone,
  onUpdate,
}: //   onEdit,
//   onClone,
//   onConfigure,
//   onDelete,
ScheduleCardProps) => {
  const {
    automationTitle: title,
    cronExpressionFriendly: description,
    triggerEnabled,
    // totalRuns,
    // cost,
    // totalCostSaved,
  } = schedule;
  //   const canEdit = schedule.canEdit !== false;
  const canEdit = true;
  const router = useRouter();
  const { currentUser } = useAuth();

  const [runInfo, setRunInfo] = useState<{nextRun?: Date, previousRun?: Date}>({});
  const [isToggling, setIsToggling] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [automationData, setAutomationData] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRuntimeEnv, setEditingRuntimeEnv] = useState<string>('');
  const [editingDescription, setEditingDescription] = useState<string>('');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState<boolean>(true);
  const [emailOnCompleted, setEmailOnCompleted] = useState<boolean>(true);
  const [emailOnFailed, setEmailOnFailed] = useState<boolean>(true);

  // Fetch automation data to check admin status
  useEffect(() => {
    const fetchAutomation = async () => {
      try {
        const response = await fetch(`/api/automations/${schedule.automationId}`);
        if (response.ok) {
          const data = await response.json();
          setAutomationData(data);
        }
      } catch (error) {
        console.error('Error fetching automation:', error);
      }
    };
    fetchAutomation();
  }, [schedule.automationId]);

  // Check if current user is admin
  const isAdmin = currentUser && automationData && (
    (automationData.adminUserIds && Array.isArray(automationData.adminUserIds) && (
      automationData.adminUserIds.includes(String(currentUser._id)) ||
      automationData.adminUserIds.some((id: any) => String(id) === String(currentUser._id))
    )) ||
    automationData.createdBy === String(currentUser._id) ||
    automationData.isOwner === true
  );

  useEffect(() => {
    // Calculate next and previous run times
    try {
      const parser = require('cron-parser');
      const interval = parser.parseExpression(schedule.cronExpression, {
        tz: schedule.timezone || 'UTC'
      });

      const nextRun = interval.next().toDate();
      const previousRun = interval.prev().toDate();

      setRunInfo({ nextRun, previousRun });
    } catch (error) {
      console.error('Error calculating run times:', error);
    }
  }, [schedule.cronExpression, schedule.timezone]);

  const handleCloneClick = async () => {
    if (!isAdmin) {
      toast.error("Error", "You do not have permission to clone this automation");
      return;
    }
    
    setIsCloning(true);
    try {
      await onClone?.({
        id: schedule.automationId,
        title: schedule.automationTitle
      });
    } catch (error) {
      console.error('Error cloning automation:', error);
    } finally {
      setIsCloning(false);
    }
  };

  const handleRunClick = async () => {
    if (!canEdit) {
      // setRunModalOpen(true);
    } else {
      onRun?.(schedule.automationId);
    }
  };

  const handleToggleStatus = async (checked: boolean) => {
    if (!canEdit) return;
    
    setIsToggling(true);
    try {
      const response = await fetch(`/api/automations/${schedule.automationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggerEnabled: checked
        })
      });

      if (response.ok) {
        onToggleStatus?.(schedule.automationId, checked);
        toast.success(`Schedule ${checked ? 'enabled' : 'disabled'} successfully`);
      } else {
        const errorData = await response.json();
        toast.error("Error",errorData.error || 'Failed to update schedule status');
      }
    } catch (error) {
      console.error('Error toggling schedule status:', error);
      toast.error("Error",'Failed to update schedule status');
    } finally {
      setIsToggling(false);
    }
  };

  const handleEditClick = () => {
    setEditingRuntimeEnv(schedule.runtimeEnvironment || '');
    setEditingDescription(schedule.scheduleDescription || '');
    setEmailNotificationsEnabled(schedule.emailNotificationsEnabled !== false);
    setEmailOnCompleted(schedule.emailOnCompleted !== false);
    setEmailOnFailed(schedule.emailOnFailed !== false);
    setShowEditModal(true);
  };

  const handleSaveRuntimeEnv = async () => {
    try {
      const response = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: schedule._id,
          runtimeEnvironment: editingRuntimeEnv,
          scheduleDescription: editingDescription,
          emailNotificationsEnabled: emailNotificationsEnabled,
          emailOnCompleted: emailOnCompleted,
          emailOnFailed: emailOnFailed
        })
      });

      if (response.ok) {
        toast.success('Schedule settings updated successfully');
        setShowEditModal(false);
        // Call the update callback to refresh schedules without page reload
        onUpdate?.();
      } else {
        const errorData = await response.json();
        toast.error("Error", errorData.error || 'Failed to update schedule settings');
      }
    } catch (error) {
      console.error('Error updating schedule settings:', error);
      toast.error("Error", 'Failed to update schedule settings');
    }
  };

  return (
    <div className="p-5 rounded-[16px] list-item-background-color flex gap-[20px] hover:shadow-[0_4px_25px_0_#0000001A] transition-all duration-300 mb-2 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <Clock size={18} className="text-gray-500" />
            {triggerEnabled ? (
              <Play className="absolute -bottom-1 -right-1 w-3 h-3 text-green-600 bg-white rounded-full" />
            ) : (
              <Pause className="absolute -bottom-1 -right-1 w-3 h-3 text-red-600 bg-white rounded-full" />
            )}
          </div>
          <Link href={`/canvas/${schedule.automationId}`} className="flex-1 min-w-0">
            <Typography.Paragraph
              className="ai-gradient-text !text-[20px] !mb-0 cursor-pointer hover:opacity-80 transition-opacity"
              ellipsis={{ rows: 1, tooltip: true }}
            >
              {title}
            </Typography.Paragraph>
          </Link>
        </div>
        <div className="flex gap-3 justify-end items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {triggerEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={triggerEnabled}
              onChange={handleToggleStatus}
              loading={isToggling}
              size="small"
            />
          </div>
          {/* <Tooltip title="Delete automation">
            {canEdit && (
              <Button
                icon={<Trash2 size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                // onClick={() => onDelete?.(schedule.id, schedule.title)}
              />
            )}
          </Tooltip> */}
          <Tooltip title="Edit schedule settings">
            <Button
              icon={<Settings size={18} className="mt-[5px]" />}
              type="text"
              shape="circle"
              onClick={handleEditClick}
            />
          </Tooltip>
          <Tooltip title="View automation">
            <Link href={`/canvas/${schedule.automationId}`}>
              <Button
                icon={<EyeIcon size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                // onClick={onEdit}
              />
            </Link>
          </Tooltip>
          {/* Clone Automation - Only visible to admins */}
          {isAdmin && (
            <Tooltip title={isCloning ? "Cloning automation..." : "Clone automation"}>
              <Button
                icon={isCloning ? (
                  <div className="w-[18px] h-[18px] border-2 border-white border-t-transparent rounded-full animate-spin" style={{ marginTop: 5 }} />
                ) : (
                  <Copy size={18} style={{ marginTop: 5 }} />
                )}
                type="primary"
                shape="circle"
                onClick={handleCloneClick}
                loading={isCloning}
                disabled={isCloning}
              />
            </Tooltip>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Typography.Paragraph
          className="!m-0 secondary-text"
          ellipsis={{ rows: 2, tooltip: true }}
        >
          {description} <span className="tertiary-text">({schedule.timezone || 'UTC'})</span>
        </Typography.Paragraph>

        <div className="flex justify-between items-center text-xs font-normal tertiary-text">
          <div className="flex gap-4">
            {runInfo.previousRun && (
              <span>
                Previous: {runInfo.previousRun.toLocaleString(undefined, {
                  timeZone: schedule.timezone || 'UTC',
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </span>
            )}
            {runInfo.nextRun && (
              <span>
                Next: {runInfo.nextRun.toLocaleString(undefined, {
                  timeZone: schedule.timezone || 'UTC',
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </span>
            )}
          </div>
          <span>
            Created: {schedule.createdAt ? new Date(schedule.createdAt).toLocaleDateString() : 'Unknown'}
          </span>
        </div>
      </div>
      {/* <div className="w-[50%]">
        <Typography.Paragraph
          className="ai-gradient-text !text-[20px] !mb-[16px]"
          ellipsis={{ rows: 1, tooltip: true }}
        >
          {title}
        </Typography.Paragraph>
        <Typography.Paragraph
          className="!m-0 secondary-text"
          ellipsis={{ rows: 2, tooltip: true }}
        >
          {description}
        </Typography.Paragraph>
      </div>
      <div className="w-[50%] flex flex-col justify-between">
        <div className="flex gap-3 justify-end">
          <Tooltip title="Delete automation">
            {canEdit && (
              <Button
                icon={<Trash2 size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                onClick={() => onDelete?.(automation.id, automation.title)}
              />
            )}
          </Tooltip>
          <Tooltip title="View automation">
            <Link href={`/canvas/${automation.id}`}>
              <Button
                icon={<EyeIcon size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                // onClick={onEdit}
              />
            </Link>
          </Tooltip>
          <Tooltip title="Run automation">
            <Button
              icon={<CaretRightFilled style={{ fontSize: 18, marginTop: 5 }} />}
              type="primary"
              shape="circle"
              onClick={handleRunClick}
            />
          </Tooltip>
        </div>
        <div className="flex gap-2 justify-end">
          <span>Total runs: {totalRuns}</span>
          <span>Schedules: {0}</span>
          <span>
            Cost Saved: {currencySymbols[automation.currency || ""] || "$"}
            {(() => {
              const totalCost = automation.totalCostSaved;
              if (
                totalCost === undefined ||
                totalCost === null ||
                isNaN(totalCost) ||
                !isFinite(totalCost)
              ) {
                return "0";
              }
              if (totalCost === 0) {
                return "0";
              }
              return totalCost % 1 === 0
                ? totalCost.toFixed(0)
                : totalCost.toFixed(2);
            })()}
          </span>
        </div>
      </div> */}

      {/* Edit Schedule Settings Modal */}
      <Modal
        title="Schedule Settings"
        open={showEditModal}
        onOk={handleSaveRuntimeEnv}
        onCancel={() => setShowEditModal(false)}
        okText="Save"
        cancelText="Cancel"
        width={500}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Runtime Environment</label>
            <Select
              value={editingRuntimeEnv}
              onChange={(value) => setEditingRuntimeEnv(value)}
              style={{ width: '100%' }}
              placeholder="Use automation's default"
            >
              <Select.Option value="">Use automation's default</Select.Option>
              <Select.Option value="dev">Development</Select.Option>
              <Select.Option value="test">Test</Select.Option>
              <Select.Option value="production">Production</Select.Option>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Override the automation's runtime environment for this schedule only
            </p>
          </div>
          {schedule.runtimeEnvironment && (
            <div className="text-sm text-gray-600">
              Current: <span className="font-medium">{schedule.runtimeEnvironment || 'Using automation default'}</span>
            </div>
          )}
        </div>

        <Divider />

        <div className="mb-4">
          <div className="mb-3">
            <h4 className="text-sm font-medium mb-2">Email Notifications</h4>
            <div className="flex gap-2 mb-3">
              <Switch
                checked={emailNotificationsEnabled}
                onChange={(checked) => {
                  setEmailNotificationsEnabled(checked);
                }}
              />
              <span className="text-sm">
                {emailNotificationsEnabled ? "Enable email notifications" : "Disable email notifications"}
              </span>
            </div>
          </div>

          {emailNotificationsEnabled && (
            <div className="ml-6 space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={emailOnCompleted}
                  onChange={(e) => {
                    setEmailOnCompleted(e.target.checked);
                  }}
                />
                <span className="text-sm">On Success</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={emailOnFailed}
                  onChange={(e) => {
                    setEmailOnFailed(e.target.checked);
                  }}
                />
                <span className="text-sm">On Failure</span>
              </div>
            </div>
          )}
        </div>

        <Divider />

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <Input.TextArea
            placeholder="Schedule description"
            autoSize={{ minRows: 3, maxRows: 6 }}
            onChange={(e) => {
              setEditingDescription(e.target.value);
            }}
            value={editingDescription}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ScheduleCard;
