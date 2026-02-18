import { Button, Input, Modal, Switch, Checkbox, Divider, Select } from "antd";
import useAutomationEditor from "../hooks/automation-editor";
import { useEffect, useState } from "react";
import { toast } from '@/hooks/use-toast';

interface Schedule {
  _id: string;
  automationId: string;
  runtimeEnvironment?: string;
  scheduleDescription?: string;
  emailNotificationsEnabled?: boolean;
  emailOnCompleted?: boolean;
  emailOnFailed?: boolean;
  cronExpression: string;
  cronExpressionFriendly: string;
}

const ScheduleAutomationModal = () => {
  const automationEditor = useAutomationEditor();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [state, setState] = useState<{
    triggerEnabled: boolean;
    description: any;
    emailNotificationsEnabled: boolean;
    emailOnCompleted: boolean;
    emailOnFailed: boolean;
    scheduleRuntimeEnvironment: string;
  }>({
    triggerEnabled: false,
    description: undefined,
    emailNotificationsEnabled: true,
    emailOnCompleted: true,
    emailOnFailed: true,
    scheduleRuntimeEnvironment: '',
  });

  // Load schedules for this automation
  useEffect(() => {
    if (automationEditor.showScheduleAutomationModal) {
      loadSchedules();
    }
  }, [automationEditor.showScheduleAutomationModal]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const automationId = automationEditor.automationRef.current?._id;
      const response = await fetch(`/api/schedules-v2?automationId=${automationId}`);
      if (response.ok) {
        const data = await response.json();
        setSchedules(data);
        if (data.length > 0) {
          // Select first schedule by default
          setSelectedScheduleId(data[0]._id);
          loadScheduleData(data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScheduleData = (schedule: Schedule) => {
    setState({
      triggerEnabled: automationEditor.automationRef.current?.triggerEnabled || false,
      description: schedule.scheduleDescription || '',
      emailNotificationsEnabled: schedule.emailNotificationsEnabled !== false,
      emailOnCompleted: schedule.emailOnCompleted !== false,
      emailOnFailed: schedule.emailOnFailed !== false,
      scheduleRuntimeEnvironment: schedule.runtimeEnvironment || '',
    });
  };

  // When selected schedule changes, load its data
  useEffect(() => {
    const selectedSchedule = schedules.find(s => s._id === selectedScheduleId);
    if (selectedSchedule) {
      loadScheduleData(selectedSchedule);
    }
  }, [selectedScheduleId]);

  const onUpdate = async () => {
    if (!selectedScheduleId) {
      toast.error('Please select a schedule to update');
      return;
    }

    try {
      // Update triggerEnabled on automation (global enable/disable)
      automationEditor.automationRef.current.triggerEnabled = state.triggerEnabled;
      automationEditor.setDocVersion((v) => v + 1);

      // Update schedule-specific settings
      const response = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: selectedScheduleId,
          runtimeEnvironment: state.scheduleRuntimeEnvironment,
          scheduleDescription: state.description,
          emailNotificationsEnabled: state.emailNotificationsEnabled,
          emailOnCompleted: state.emailOnCompleted,
          emailOnFailed: state.emailOnFailed
        })
      });

      if (response.ok) {
        automationEditor.setShowScheduleAutomationModal(false);
        toast.success('Schedule settings updated successfully!');
        loadSchedules(); // Reload schedules
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Failed to update schedule settings');
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error('Failed to update schedule settings');
    }
  };

  return (
    <Modal
      title="Schedule Settings"
      width={500}
      footer={false}
      open={automationEditor.showScheduleAutomationModal}
      onCancel={() => {
        automationEditor.setShowScheduleAutomationModal(false);
      }}
    >
      {schedules.length === 0 && !loading && (
        <div className="text-center text-gray-500 py-4">
          No schedules found. Create a schedule first.
        </div>
      )}

      {schedules.length > 0 && (
        <>
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2">Select Schedule</h4>
            <Select
              value={selectedScheduleId}
              onChange={setSelectedScheduleId}
              style={{ width: '100%' }}
              loading={loading}
            >
              {schedules.map((schedule) => (
                <Select.Option key={schedule._id} value={schedule._id}>
                  {schedule.cronExpressionFriendly}
                </Select.Option>
              ))}
            </Select>
          </div>

          <Divider />

          <div className="mb-4 flex gap-2">
            <Switch
              checked={state.triggerEnabled}
              onChange={(checked) => {
                setState({
                  ...state,
                  triggerEnabled: checked,
                });
              }}
            />
            {state.triggerEnabled ? "Scheduling Enabled (Global)" : "Scheduling Disabled (Global)"}
          </div>

          <Divider />

      <div className="mb-4">
        <div className="mb-3">
          <h4 className="text-sm font-medium mb-2">Email Notifications</h4>
          <div className="flex gap-2 mb-3">
            <Switch
              checked={state.emailNotificationsEnabled}
              onChange={(checked) => {
                setState({
                  ...state,
                  emailNotificationsEnabled: checked,
                });
              }}
            />
            <span className="text-sm">
              {state.emailNotificationsEnabled ? "Enable email notifications" : "Disable email notifications"}
            </span>
          </div>
        </div>

        {state.emailNotificationsEnabled && (
          <div className="ml-6 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={state.emailOnCompleted}
                onChange={(e) => {
                  setState({
                    ...state,
                    emailOnCompleted: e.target.checked,
                  });
                }}
              />
              <span className="text-sm">On Success</span>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={state.emailOnFailed}
                onChange={(e) => {
                  setState({
                    ...state,
                    emailOnFailed: e.target.checked,
                  });
                }}
              />
              <span className="text-sm">On Failure</span>
            </div>
          </div>
        )}
      </div>

      <Divider />

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Schedule Runtime Environment</h4>
        <Select
          value={state.scheduleRuntimeEnvironment}
          onChange={(value) => {
            setState({
              ...state,
              scheduleRuntimeEnvironment: value,
            });
          }}
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

      <Divider />

      <Input.TextArea
        placeholder="Description"
        autoSize={{ minRows: 3, maxRows: 6 }}
        onChange={(e) => {
          setState((oldValue) => ({
            ...oldValue,
            description: e.target.value,
          }));
        }}
        value={state.description}
      />
      <div className="flex gap-2 mt-4">
        <Button shape="round" type="primary" onClick={onUpdate}>
          Update
        </Button>
        <Button
          shape="round"
          onClick={() => {
            automationEditor.setShowScheduleAutomationModal(false);
          }}
        >
          Cancel
        </Button>
      </div>
      </>
      )}
    </Modal>
  );
};

export default ScheduleAutomationModal;
