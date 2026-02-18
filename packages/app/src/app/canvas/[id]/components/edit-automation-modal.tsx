"use client";

import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button, Input, message, Spin } from "antd";
import { useEffect, useState } from "react";
import useAutomationEditor from "../hooks/automation-editor";
import { StandardizedSelect, StandardizedSelectOption } from "@/components/ui/standardized-select";

const EditAutomationModal = ({
  showEditAutomationModal,
  onClose,
}: {
  showEditAutomationModal: boolean;
  onClose: () => void;
}) => {
  const automationEditor = useAutomationEditor();

  // Edit modal state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editStatus, setEditStatus] = useState<"draft" | "live" | "not_in_use">(
    "draft"
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (showEditAutomationModal) {
      const automation = automationEditor.automationRef.current;
      if (automation) {
        setEditTitle(automation.title || "");
        setEditDescription(automation.description || "");
        setEditCost(automation.cost?.toString() || "");
        setEditCurrency(automation.currency || "USD");
        setEditStatus(
          automation.status || (automation.isPublished ? "live" : "draft")
        );
      }
    }
  }, [showEditAutomationModal]);

  return (
    <Dialog open={showEditAutomationModal} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg w-full max-w-[95vw] max-h-[90vh] overflow-y-auto container-background-color border-none"
        style={{ maxHeight: "var(--window-height)", overflowY: "auto" }}
      >
        <DialogHeader>
          <DialogTitle>Edit Automation</DialogTitle>
        </DialogHeader>
        <Spin spinning={isLoading}>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Automation Name *
              </Label>
              <Input 
                value={editTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditTitle(e.target.value);
                }}
                placeholder="Enter automation name"
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Description
              </Label>
              <Input.TextArea 
                value={editDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setEditDescription(e.target.value);
                }}
                placeholder="Describe what this automation does..."
                rows={4}
                maxLength={500}
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Cost Saved per Run ({editCurrency})
              </Label>
              <Input 
                type="number"
                value={editCost}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditCost(e.target.value);
                }}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <StandardizedSelect
                value={editCurrency}
                onChange={(value) => setEditCurrency(value as string)}
                label="Currency"
              >
                <StandardizedSelectOption value="USD">USD</StandardizedSelectOption>
                <StandardizedSelectOption value="EUR">EUR</StandardizedSelectOption>
                <StandardizedSelectOption value="GBP">GBP</StandardizedSelectOption>
                <StandardizedSelectOption value="SEK">SEK</StandardizedSelectOption>
                <StandardizedSelectOption value="JPY">JPY</StandardizedSelectOption>
                <StandardizedSelectOption value="AUD">AUD</StandardizedSelectOption>
                <StandardizedSelectOption value="CAD">CAD</StandardizedSelectOption>
                <StandardizedSelectOption value="CHF">CHF</StandardizedSelectOption>
                <StandardizedSelectOption value="CNY">CNY</StandardizedSelectOption>
                <StandardizedSelectOption value="INR">INR</StandardizedSelectOption>
              </StandardizedSelect>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Status
              </Label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="draft"
                    checked={editStatus === 'draft'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Draft</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="live"
                    checked={editStatus === 'live'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Live</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="not_in_use"
                    checked={editStatus === 'not_in_use'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Not in Use</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={() => onClose()}>Cancel</Button>
              <Button
                type="primary"
                onClick={async () => {
                  try {
                    const automation = automationEditor.automationRef.current;
                    if (!automation) return;

                    setIsLoading(true);

                    const response = await fetch(
                      `/api/automations/${automation._id}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: editTitle,
                          description: editDescription,
                          cost: parseFloat(editCost) || 0,
                          currency: editCurrency,
                          status: editStatus,
                        }),
                      }
                    );

                    if (response.ok) {
                      // Update the automation ref with new data
                      automation.title = editTitle;
                      automation.description = editDescription;
                      automation.cost = parseFloat(editCost) || 0;
                      automation.currency = editCurrency;
                      automation.status = editStatus;

                      toast.success("Automation updated successfully!");
                      onClose();
                    } else {
                      toast.error("Error","Failed to update automation");
                    }
                  } catch (error) {
                    console.error("Error updating automation:", error);
                    toast.error("Error","Failed to update automation");
                  }
                  setIsLoading(false);
                }}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </Spin>
      </DialogContent>
    </Dialog>
  );
};

export default EditAutomationModal;
