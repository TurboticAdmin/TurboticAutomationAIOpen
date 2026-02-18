"use client";
import { App, Button, Input, InputRef, Spin } from "antd";
import { toast } from '@/hooks/use-toast';
import "./Landing.scss";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  Mail,
  MessageSquare,
  TrendingUp,
  Bot,
  Database,
  Paperclip,
  X,
  Copy,
  Gift,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/app/authentication";
import { useUpgrade } from "@/contexts/UpgradeContext";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Tooltip } from "antd";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Script from "next/script";
import { useUserCapabilities } from "@/hooks/useUserCapabilities";
import { OnboardingTour } from "./OnboardingTour";
import AutomationCard from "@/app/automations/components/automation-card";
import EditAutomationModal from "@/components/EditAutomationModal";

// Dynamically import speech recognition components with SSR disabled
const SpeechRecognitionButton = dynamic(
  () => import("./SpeechRecognitionButton"),
  { ssr: false }
);

const SpeechRecognitionStatus = dynamic(
  () => import("./SpeechRecognitionStatus"),
  { ssr: false }
);

// Component for displaying attached image previews
function AttachedImagePreview({ 
  file, 
  previewUrl, 
  onRemove
}: { 
  file: File; 
  previewUrl: string; 
  onRemove: () => void;
}) {
  const [showRemove, setShowRemove] = useState(false);
  const isDarkMode = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  return (
    <div 
      style={{ 
        position: 'relative',
        display: 'inline-block'
      }}
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
    >
      <img
        src={previewUrl}
        alt={file.name}
        style={{
          width: 60,
          height: 60,
          objectFit: 'cover',
          borderRadius: 4,
          border: `1px solid ${isDarkMode ? '#30363d' : '#d0d7de'}`
        }}
      />
      {showRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 20,
            height: 20,
            backgroundColor: '#ef4444',
            borderRadius: '50%',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 2
          }}
        >
          <X size={12} color="white" />
        </button>
      )}
      <div style={{ 
        fontSize: '11px',
        marginTop: 4,
        maxWidth: 60,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: isDarkMode ? '#8b949e' : '#656d76'
      }}>
        {file.name.length > 10 ? `${file.name.substring(0, 10)}...` : file.name}
      </div>
    </div>
  );
}

const defaultAutomations = [
  {
    icon: Mail,
    title: "Daily Reporting",
    description:
      "Fetch last 10 added contact from Hubspot, and summarise all the leads using open ai and send the summary to me via sendgrid",
  },
  {
    icon: MessageSquare,
    title: "Customer Operations",
    description:
      "Read unread support emails from Gmail, classify them using Claude, and forward critical ones via SendGrid",
  },
  {
    icon: TrendingUp,
    title: "Sales Marketing",
    description:
      "Scrape LinkedIn posts from a competitor, summarize themes using OpenAI, and Slack a trend report",
  },
  {
    icon: Bot,
    title: "Agent Workflows",
    description:
      "Query customer complaints from Gmail, let Cohere classify them, Claude suggest resolution, and GPT-4 summarize weekly themes",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    description:
      "Download campaign feedback from Google Sheets, run topic extraction with Cohere, and email marketing insights",
  },
  {
    icon: Database,
    title: "Data Integration",
    description:
      "Connect with 1000+ apps and services worldwide. Pull Zendesk tickets, summarize customer complaints using Mistral, and tag the tickets with suggested resolution labels",
  },
];
const LandingV2 = () => {
  const router = useRouter();
  const [automationInput, setAutomationInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<InputRef>(null);
  const [automations, setAutomations] = useState<any[]>([]);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const { isAuthenticated, getCurrentUser, currentUser } = useAuth();
  const { handleApiError } = useUpgrade();
  const { message, modal } = App.useApp();
  const { canChat, loading: capabilitiesLoading } = useUserCapabilities();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showEditAutomationModal, setShowEditAutomationModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<any>(null);
  const [automationsLoading, setAutomationsLoading] = useState(false);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Subscription and promotion code logic removed for open source

  // Only enable chat features if user is not authenticated OR if capabilities are loaded and allow chat
  const isChatEnabled = !isAuthenticated || (!capabilitiesLoading && canChat);

  // Debug logging
  useEffect(() => {
  }, [isAuthenticated, currentUser, canChat, capabilitiesLoading, isChatEnabled]);

  const handleAutomateRef = useRef<() => void>(() => {});

  const handleAutomate = async () => {
    if (!automationInput.trim() && attachedImages.length === 0) {
      toast.error("Error","Please enter what you want to automate or attach an image");
      return;
    }

    // Track button click


    // Check if user is authenticated
    if (!isAuthenticated) {
      toast.info("Please sign in to create automations");
      getCurrentUser(true); // Open auth dialog
      return;
    }

    // Check if user has chat capability (automation creation uses AI)
    if (!isChatEnabled) {
      toast.error("Error","Chat capability is currently disabled for your account. Please contact your administrator.");
      return;
    }

    setLoading(true);
    try {
      let response: Response;
      
      if (attachedImages.length > 0) {
        // Use FormData when images are attached
        const formData = new FormData();
        formData.append('prompt', automationInput);
        attachedImages.forEach((file) => {
          formData.append('promptImages', file);
        });
        
        response = await fetch("/api/automations", {
          method: "POST",
          body: formData
        });
      } else {
        // Use JSON when no images
        response = await fetch("/api/automations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: automationInput,
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.requiresAuth) {
          toast.info("Please sign in to create automations");
          getCurrentUser(true); // Open auth dialog
          return;
        }
        throw errorData; // Throw the full error object to preserve upgradeAction
      }

      const data = await response.json();
      
      // Track automation creation

      // Clean up image previews
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
      setAttachedImages([]);
      setImagePreviews([]);
      
      router.push(`/canvas/${data.automationId}`);
    } catch (error) {
      console.error("Error creating automation:", error);
      
      // Try to handle upgrade action first
      if (handleApiError(error)) {
        return; // Upgrade modal was shown, don't show additional error message
      }
      
      toast.error("Error",error instanceof Error ? error.message : "Failed to create automation");
    } finally {
      setLoading(false);
    }
  };

  // Update the ref whenever handleAutomate changes
  handleAutomateRef.current = handleAutomate;

  const handleFeatureClick = (description: string) => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast.info("Please sign in to create automations");
      getCurrentUser(true); // Open auth dialog
      return;
    }

    setAutomationInput(description);
    // Scroll to the top of the page
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const fetchAutomations = async () => {
    setAutomationsLoading(true);
    try {
      const response = await fetch("/api/get-all-automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 6, lastId: null }),
      });
      const data = await response.json();
      setAutomations(
        (data.items || []).map((item: any) => ({
          ...item,
          icon: Mail,
          _id: item._id,
          id: item._id
        }))
      );
    } catch (error) {
      console.error("Error fetching automations:", error);
    }
    setAutomationsLoading(false);
  };

  // Subscription checkout logic removed for open source

  useEffect(() => {
    if (isAuthenticated) {
      fetchAutomations();
    }
  }, [isAuthenticated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setAutomationInput(newValue);
  };

  // Handle paste events to capture images from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    // Check each item in the clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          // Convert blob to File with a proper name
          const timestamp = Date.now();
          const fileExtension = blob.type.split('/')[1] || 'png';
          const fileName = `pasted-image-${timestamp}.${fileExtension}`;
          const file = new File([blob], fileName, { type: blob.type });
          imageFiles.push(file);
        }
      }
    }

    // If images were found, add them to attached images
    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent pasting the image data as text
      setAttachedImages((prevImages) => {
        // Create a Set of existing file names + sizes to check for duplicates
        const existingFiles = new Set(
          prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
        );
        
        // Filter out duplicates based on name, size, and lastModified
        const uniqueNewFiles = imageFiles.filter(f => {
          const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
          return !existingFiles.has(fileKey);
        });
        
        // Combine existing files with new unique files
        const combinedFiles = [...prevImages, ...uniqueNewFiles];
        
        // Create previews only for new files
        const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
        
        // Update previews state by appending new previews
        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
        
        return combinedFiles;
      });
      
      // Show a success message
      message.success(`${imageFiles.length} image(s) pasted`);
    }
  };


  const handleEditAutomation = (automationId: string) => {
    const automation = automations.find(a => a._id === automationId);
    if (automation) {
      setEditingAutomation(automation);
      // setEditTitle(automation.title || '');
      // setEditDescription(automation.description || '');
      // setEditCost(automation.cost ? automation.cost.toString() : '');
      // setEditCurrency(automation.currency || 'USD');
      // setEditStatus(automation.status || (automation.isPublished ? 'live' : 'draft'));
      setShowEditAutomationModal(true);
    }
  };

  const handleDeleteAutomation = async (automationId: string, automationTitle: string) => {
    // Show confirmation dialog with custom styling
    const confirmed = await modal.confirm({
      title: (
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-sm font-bold">!</span>
          </div>
          <div>
            <div className="text-color">Delete Automation</div>
          </div>
        </div>
      ),
      content: `Are you sure you want to delete "${automationTitle}"? This action cannot be undone.`,
      icon: null,
      closable: true,
      okText: 'Delete',
      cancelText: 'Cancel',
    })
    if (!confirmed) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/automations?automationId=${automationId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        toast.success('Automation deleted successfully');
        // Refresh the automations list
        await fetchAutomations();
      } else {
        const errorData = await response.json();
        toast.error("Error",errorData.error || 'Failed to delete automation');
      }
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error("Error",'Failed to delete automation');
    }
    setLoading(false);
  };

  const handleCloneAutomation = async (automation: any) => {
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automationId: automation.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to clone automation');
      }

      const data = await response.json();
      
      // Refresh the automations list to show the new clone
      await fetchAutomations();
      
      toast.success(`Automation "${automation.title}" cloned successfully`);
      
      // Optionally redirect to the new automation
      router.push(`/canvas/${data.automationId}`);
    } catch (error) {
      toast.error("Error",'Failed to clone automation');
    }
  };

  return (
    <>
      {!isAuthenticated && (
        <Script
          id="landing-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "AI-Powered Incident Response Automation",
              description:
                "This automation identifies security alerts and automatically creates SOC incident tasks.",
              image:
                process.env.NEXT_PUBLIC_APP_URL 
                  ? `${process.env.NEXT_PUBLIC_APP_URL}/images/incident-response-thumbnail.jpg`
                  : "/images/incident-response-thumbnail.jpg",
              url: process.env.NEXT_PUBLIC_APP_URL 
                  ? `${process.env.NEXT_PUBLIC_APP_URL}/canvas/68e0ad20e96a8719aa0f5da8`
                  : "/canvas/68e0ad20e96a8719aa0f5da8",
            }),
          }}
        />
      )}
      <div className="flex relative">
      <OnboardingTour page="landing" />
      <div className="landing-container flex-1" style={{ paddingTop: !isAuthenticated ? '0' : '0' }}>
        <div className="flex flex-col gap-4 items-center justify-center text-center landing-content h-full">
          <div className="landing-title">
            Think it. Type it. Automate it.
          </div>
          <div className="text-xl">
          Turn ideas into automations in minutes
          </div>
          {/* Promotion code and checkout logic removed for open source */}
          <div className="chat-input-area">
            {/* Display attached images */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 mb-2 border rounded" style={{ 
                borderColor: 'rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)'
              }}>
                {attachedImages.map((file, index) => (
                  <AttachedImagePreview
                    key={index}
                    file={file}
                    previewUrl={imagePreviews[index]}
                    onRemove={() => {
                      const newFiles = attachedImages.filter((_, i) => i !== index);
                      const newPreviews = imagePreviews.filter((_, i) => i !== index);
                      setAttachedImages(newFiles);
                      setImagePreviews(newPreviews);
                      URL.revokeObjectURL(imagePreviews[index]);
                      const input = document.getElementById('landing-image-input') as HTMLInputElement | null;
                      if (input) input.value = '';
                    }}
                  />
                ))}
              </div>
            )}
            <div className="flex-1 mb-2">
              <Input.TextArea
                size="large"
                placeholder={!isChatEnabled ? "Chat capability is currently disabled" : "What would you like to automate today?"}
                onChange={handleInputChange}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAutomate();
                  }
                }}
                onFocus={(e) => {
                  if (!isAuthenticated) {
                    e.preventDefault();
                    e.target.blur();
                    toast.info("Please sign in to create automations");
                    getCurrentUser(true); // Open auth dialog
                    return;
                  }
                  if (!isChatEnabled) {
                    e.preventDefault();
                    e.target.blur();
                    toast.error("Error","Chat capability is currently disabled for your account. Please contact your administrator.");
                    return;
                  }
                }}
                autoFocus={isAuthenticated && isChatEnabled}
                ref={inputRef}
                disabled={!isChatEnabled || loading}
                value={automationInput}
                autoSize={{ minRows: 1, maxRows: 5 }}
                id="chat-input"
                data-tour="chat-input"
              />
              <SpeechRecognitionStatus onEnterCommand={handleAutomate} />
            </div>
            <div className="flex justify-between">
              <div className="inline-flex gap-2">
                <input
                  id="landing-image-input"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    if (newFiles.length > 0) {
                      setAttachedImages((prevImages) => {
                        const existingFiles = new Set(
                          prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
                        );
                        const uniqueNewFiles = newFiles.filter(f => {
                          const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
                          return !existingFiles.has(fileKey);
                        });
                        const combinedFiles = [...prevImages, ...uniqueNewFiles];
                        const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
                        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
                        return combinedFiles;
                      });
                    }
                    e.target.value = '';
                  }}
                />
                <Tooltip title={attachedImages.length > 0 ? `${attachedImages.length} image(s) attached` : 'Attach images'}>
                  <Button
                    onClick={() => {
                      const input = document.getElementById('landing-image-input') as HTMLInputElement | null;
                      if (input) {
                        input.value = '';
                        input.click();
                      }
                    }}
                    className="!w-[32px]"
                    type="text"
                    shape="round"
                    icon={<Paperclip size={16} />}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    disabled={!isChatEnabled || loading}
                  />
                </Tooltip>
              </div>
              <div className="inline-flex gap-2">
                <SpeechRecognitionButton
                  isAuthenticated={isAuthenticated}
                  loading={loading}
                  onTranscriptUpdate={setAutomationInput}
                  onEnterCommand={handleAutomate}
                  message={message}
                  getCurrentUser={getCurrentUser}
                  canChat={isChatEnabled}
                />
                <Button
                  style={{
                    height: 32,
                    width: 32,
                  }}
                  shape="round"
                  type="primary"
                  // icon={<SendOutlined />}
                  icon={<ArrowUp size={18} />}
                  disabled={(!isChatEnabled || loading) || (!automationInput.trim() && attachedImages.length === 0)}
                  loading={loading}
                  onClick={handleAutomate}
                  data-tour="send-button"
                />
              </div>
            </div>
          </div>
        </div>
        {/* 
        className=""
        style={
          {
            //   background:
            // "linear-gradient(182deg,rgba(232, 242, 254, 1) 0%, rgba(247, 250, 254, 1) 100%)",
          }
        } */}
        <div>
          <div className="automation-container mx-5 p-5">
            <div className="flex justify-between mb-5">
              <span className="text-lg">
                {isAuthenticated ? "Your automations" : "Sample automation ideas"}
              </span>
              {isAuthenticated && (
                <Link href="/automations">
                  <Button type="text">View all automations</Button>
                </Link>
              )}
            </div>
            {/* className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" */}
            <Spin spinning={automationsLoading}>
              <div className="flex gap-5 flex-wrap">
                {!automations.length && defaultAutomations.map((feature, index) => (
                  <Card
                    key={index}
                    className="w-full cursor-pointer list-item-background-color border-0 rounded-[16px]"
                    // className={`card-glass hover:shadow-2xl transition-all duration-300 group cursor-pointer hover:scale-105`}
                    style={{
                      overflow: 'hidden',
                      position: 'relative',
                      zIndex: 1,
                      flex: '0 0 calc(50% - 20px)',
                    }}
                    onClick={() => {
                      handleFeatureClick(feature.description);
                      // if (feature._id) {
                      //   router.push(`/canvas/${feature._id}`);
                      // } else {
                      // }
                    }}
                  >
                    <CardHeader style={{ overflow: 'hidden' }}>
                      {/* <div className="w-12 h-12 bg-blue-600/10 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                        <feature.icon className="w-6 h-6 text-blue-400" />
                      </div> */}
                      <CardTitle 
                        className="text-xl ai-gradient-text "
                        title={feature.title}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '1.5',
                          maxHeight: '3em',
                          marginBottom: 0,
                          wordBreak: 'break-word',
                          wordWrap: 'break-word'
                        }}
                      >
                        {feature.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ overflow: 'hidden' }}>
                      <p 
                        className="text-[color:var(--card-text-color)] dark:text-slate-300 automation-description"
                        title={feature.description}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '1.5',
                          marginBottom: 0,
                          wordBreak: 'break-word',
                          wordWrap: 'break-word'
                        }}
                      >
                        {feature.description}
                      </p>
                      {/* {!isAuthenticated && (
                    <div className="mt-3 p-2 bg-blue-600/10 dark:bg-blue-900/30 rounded-lg">
                      <p className="text-xs text-blue-400 text-center">
                        Sign in to use this template
                      </p>
                    </div>
                  )} */}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex gap-5 flex-wrap">
                {automations.map((automation, index) => (
                  <div key={automation._id} style={{ flex: '0 0 calc(50% - 20px)', width: 'calc(50% - 10px)' }}>
                    <AutomationCard
                      automation={{
                        ...automation,
                        title: automation.title?.length > 50 ? automation.title.substring(0, 50) + '...' : automation.title,
                        description: automation.description?.length > 100 ? automation.description.substring(0, 100) + '...' : automation.description
                      }}
                      onEdit={handleEditAutomation}
                      // onRun={handleRunAutomation}
                      onClone={handleCloneAutomation}
                      onDelete={handleDeleteAutomation}
                      // isSelected={selectedItems.includes(automation.id)}
                      // onSelectionChange={handleSelectionChange}
                      key={automation._id}
                      page="landing"
                    />
                  </div>
                ))}
              </div>
            </Spin>
          </div>
        </div>
        <div className="dark:bg-slate-900/80 backdrop-blur-sm">
          <div className="px-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Pinwheel SVG Logo */}
                <img
                  src="/images/logo-horizontal.svg"
                  alt="Turbotic Logo"
                  className="h-8 w-auto max-w-none block dark:hidden"
                  style={{ objectFit: 'contain' }}
                />
                <img
                  src="/images/turbotic-logo.png"
                  alt="Turbotic Logo"
                  className="h-8 w-auto max-w-none hidden dark:block"
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                © 2025 Turbotic. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </div>
      <EditAutomationModal
        open={showEditAutomationModal}
        onClose={() =>{ 
          setShowEditAutomationModal(false); 
          setEditingAutomation(null);
        }}
        editingAutomation={editingAutomation}
        fetchAutomations={fetchAutomations}
        handleUpdateAutomation={() => {}}
      />
    </div>
    </>
  );
};

export default LandingV2;
