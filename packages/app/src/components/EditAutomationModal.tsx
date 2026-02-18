"use strict";

import { DialogTitle } from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { Input, Button as AntdButton } from "antd";
import {
  StandardizedSelect,
  StandardizedSelectOption,
} from "./ui/standardized-select";
import { Button } from "./ui/button";
import { Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/authentication";

interface Props {
  open: boolean;
  onClose: () => void;
  handleUpdateAutomation: any;
  editingAutomation: any;
  fetchAutomations: () => void;
}

const EditAutomationModal = ({
  open,
  onClose,
  editingAutomation: initialEditingAutomation,
  fetchAutomations,
}: Props) => {
  const [isUpdatingAutomation, setIsUpdatingAutomation] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editStatus, setEditStatus] = useState<"draft" | "live" | "not_in_use">(
    "draft"
  );
  const { currentUser } = useAuth();
  const [isRegeneratingApiKey, setIsRegeneratingApiKey] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<any>(null);

  useEffect(() => {
    if (initialEditingAutomation) {
      setEditTitle(initialEditingAutomation.title || "");
      setEditDescription(initialEditingAutomation.description || "");
      setEditCost(
        initialEditingAutomation.cost
          ? initialEditingAutomation.cost.toString()
          : ""
      );
      setEditCurrency(initialEditingAutomation.currency || "USD");
      setEditStatus(
        initialEditingAutomation.status ||
          (initialEditingAutomation.isPublished ? "live" : "draft")
      );
      setEditingAutomation(initialEditingAutomation);
    } else {
      setEditTitle("");
      setEditDescription("");
      setEditCost("");
      setEditCurrency("USD");
      setEditStatus("draft");
      setEditingAutomation(null);
    }
  }, [initialEditingAutomation]);

  const handleUpdateAutomation = async () => {
    if (!editingAutomation) return;

    setIsUpdatingAutomation(true);
    try {
      const response = await fetch(
        `/api/automations/${editingAutomation._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            automationId: editingAutomation._id,
            title: editTitle,
            description: editDescription,
            cost: parseFloat(editCost) || 0,
            currency: editCurrency,
            status: editStatus,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to update automation");
      }

      // Refresh the automations list
      await fetchAutomations();

      onClose();
      setEditingAutomation(null);
      setEditTitle("");
      setEditDescription("");
      setEditCost("");
      setEditCurrency("USD");
      setEditStatus("draft");

      toast.success("Automation updated successfully");
    } catch (error) {
      toast.error("Error", "Failed to update automation");
    } finally {
      setIsUpdatingAutomation(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-lg w-full max-w-[95vw] overflow-y-auto bg-white dark:bg-black border-none"
        style={{ minWidth: 600, maxHeight: "var(--window-height)" }}
      >
        <DialogHeader>
          <DialogTitle>Edit Automation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
              Automation Name *
            </label>
            <Input
              value={editTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setEditTitle(e.target.value);
              }}
              placeholder="Enter automation name"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
              Description
            </label>
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
            <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
              Cost Saved per Run ({editCurrency})
            </label>
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
              <StandardizedSelectOption value="USD">
                USD
              </StandardizedSelectOption>
              <StandardizedSelectOption value="EUR">
                EUR
              </StandardizedSelectOption>
              <StandardizedSelectOption value="GBP">
                GBP
              </StandardizedSelectOption>
              <StandardizedSelectOption value="SEK">
                SEK
              </StandardizedSelectOption>
              <StandardizedSelectOption value="JPY">
                JPY
              </StandardizedSelectOption>
              <StandardizedSelectOption value="AUD">
                AUD
              </StandardizedSelectOption>
              <StandardizedSelectOption value="CAD">
                CAD
              </StandardizedSelectOption>
              <StandardizedSelectOption value="CHF">
                CHF
              </StandardizedSelectOption>
              <StandardizedSelectOption value="CNY">
                CNY
              </StandardizedSelectOption>
              <StandardizedSelectOption value="INR">
                INR
              </StandardizedSelectOption>
            </StandardizedSelect>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
              Status
            </label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={editStatus === "draft"}
                  onChange={(e) =>
                    setEditStatus(
                      e.target.value as "draft" | "live" | "not_in_use"
                    )
                  }
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  Draft
                </span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="live"
                  checked={editStatus === "live"}
                  onChange={(e) =>
                    setEditStatus(
                      e.target.value as "draft" | "live" | "not_in_use"
                    )
                  }
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  Live
                </span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="not_in_use"
                  checked={editStatus === "not_in_use"}
                  onChange={(e) =>
                    setEditStatus(
                      e.target.value as "draft" | "live" | "not_in_use"
                    )
                  }
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-900 dark:text-white">
                  Not in Use
                </span>
              </label>
            </div>
          </div>
          {/* API Key and Usage Sample (Admin Only) */}
          {editingAutomation?.adminUserIds?.includes(currentUser?._id) && (
            <div className="flex flex-col w-full mt-6 p-4 container-background-color rounded-lg">
              <label className="block font-semibold mb-2">API key</label>
              <div className="flex items-center gap-2 mb-2 w-full">
                <Input.Password
                  value={editingAutomation?.apiKey || ""}
                  readOnly
                  style={{ wordBreak: "break-all" }}
                />

                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      editingAutomation?.apiKey || ""
                    );
                    toast.success("API key copied!");
                  }}
                  className="ml-2"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  className="ml-2 pointer"
                  disabled={isRegeneratingApiKey}
                  onClick={async () => {
                    if (!editingAutomation?._id) return;
                    setIsRegeneratingApiKey(true);
                    try {
                      const res = await fetch(
                        `/api/automations/${editingAutomation._id}/regenerate-api-key`,
                        { method: "POST" }
                      );
                      const data = await res.json();
                      if (res.ok && data.apiKey) {
                        setEditingAutomation((prev: any) => ({
                          ...prev,
                          apiKey: data.apiKey,
                        }));
                        toast.success("API key regenerated!");
                      } else {
                        toast.error(
                          "Error",
                          data.error || "Failed to regenerate API key"
                        );
                      }
                    } catch (e) {
                      toast.error(
                        "Error",
                        "Network error while regenerating API key"
                      );
                    } finally {
                      setIsRegeneratingApiKey(false);
                    }
                  }}
                >
                  {isRegeneratingApiKey ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
              <label className="block font-semibold mb-2 flex items-center gap-2">
                API usage sample
                <button
                  type="button"
                  onClick={() => {
                    // Get the current hostname
                    const hostname = window.location.hostname;
                    const sample = `# 1. Trigger the automation
curl --location 'https://${hostname}/api/automations/${editingAutomation?._id}/trigger' \\
--header 'Content-Type: application/json' \\
--data '{\n  "apiKey": "<API_KEY>"\n}'

# 2. Poll for status using the returned executionId
curl --location 'https://${hostname}/api/run/executions/<EXECUTION_ID>'`;
                    navigator.clipboard.writeText(sample);
                    toast.success("API usage sample copied!");
                  }}
                  className="p-1"
                  title="Copy API usage sample"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </label>
              <pre
                className="card-background-color p-3 rounded text-xs w-full"
                style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
              >
                {`# 1. Trigger the automation
curl --location 'https://${
                  typeof window !== "undefined"
                    ? window.location.hostname
                    : "yourdomain.com"
                }/api/automations/${editingAutomation?._id}/trigger' \\
--header 'Content-Type: application/json' \\
--data '{\n  "apiKey": "<API_KEY>"\n}'

# 2. Poll for status using the returned executionId
curl --location 'https://${
                  typeof window !== "undefined"
                    ? window.location.hostname
                    : "yourdomain.com"
                }/api/run/executions/<EXECUTION_ID>'`}
              </pre>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <AntdButton
              onClick={() => onClose()}
              disabled={isUpdatingAutomation}
            >
              Cancel
            </AntdButton>
            <AntdButton
              type="primary"
              onClick={handleUpdateAutomation}
              disabled={isUpdatingAutomation || !editTitle.trim()}
            >
              {isUpdatingAutomation ? "Updating..." : "Save Changes"}
            </AntdButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditAutomationModal;
