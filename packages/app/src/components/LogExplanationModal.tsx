import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Copy, Brain } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button as AntdButton, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface LogExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  executionStatus?: string;
  errorMessage?: string;
}

// Convert markdown-like explanation to HTML with proper formatting
const renderExplanationHtml = (raw: string) => {
  if (!raw) return '';

  // Extract code blocks first
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const placeholders: string[] = [];
  let placeholderIndex = 0;

  const withoutCode = raw.replace(codeBlockRegex, (_: any, lang: string = 'text', code: string) => {
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<pre class="rounded-md container-background-color p-4 overflow-auto"><code class="language-${lang} text-gray-800 dark:text-gray-200">${escaped}</code></pre>`;
    const token = `@@CODE_BLOCK_${placeholderIndex}@@`;
    placeholders.push(html);
    placeholderIndex += 1;
    return token;
  });

  // Transform headings/bold/bullets and line breaks
  let html = withoutCode
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>')
    .replace(/^(Overall Purpose|📦 Used Packages|📰 Function 1:[^\n]*|📧 Function 2:[^\n]*|🧩 Main Execution Block|⚙️ Environment Variables Needed|🧭 Flow Summary|💡 In short|🔹 [^\n]*|Next Steps|Recommended Actions|Analysis Summary|Key Findings|Issues Found|Solutions|Recommendations)$/gm, '<h3 class="text-lg font-bold text-blue-700 dark:text-blue-400 mt-6 mb-3">$1</h3>')
    .replace(/^(\d+\.\s)/gm, '<span class="font-semibold text-blue-600 dark:text-blue-400">$1</span>')
    .replace(/^\-\s/gm, '<span class="text-blue-600 dark:text-blue-400 mr-2">•</span>')
    .replace(/\n/g, '<br/>');

  // Re-insert code blocks
  html = html.replace(/@@CODE_BLOCK_(\d+)@@/g, (_: any, idx: string) => placeholders[Number(idx)] || '');

  return html;
};

export function LogExplanationModal({ 
  isOpen, 
  onClose, 
  logs, 
  executionStatus, 
  errorMessage 
}: LogExplanationModalProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasExplained, setHasExplained] = useState(false);

  // Automatically start analysis when modal opens
  useEffect(() => {
    if (isOpen && !hasExplained && logs && logs.length > 0) {
      explainLogs();
    }
  }, [isOpen]);

  const explainLogs = async () => {
    if (!logs || logs.length === 0) {
      toast.error("Error", 'No logs available to explain');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/logs/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logs,
          executionStatus,
          errorMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to explain logs');
      }

      const data = await response.json();
      setExplanation(data.explanation);
      setHasExplained(true);
      toast.success('Log explanation generated');
    } catch (error) {
      console.error('Error explaining logs:', error);
      toast.error("Error", 'Failed to explain logs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyExplanation = async () => {
    if (!explanation) return;
    
    try {
      await navigator.clipboard.writeText(explanation);
      toast.success('Explanation copied to clipboard');
    } catch (error) {
      toast.error("Error", 'Failed to copy explanation');
    }
  };

  const handleClose = () => {
    setExplanation(null);
    setHasExplained(false);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col z-[9999] shadow-2xl">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold text-color">
            <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            AI Log Analysis
          </DialogTitle>
          <DialogDescription id="log-explanation-description" className="sr-only">
            AI-generated explanation of execution logs
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Explanation Display */}
          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <Spin
                  indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />}
                  size="large"
                />
                <h3 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-white">Analyzing Logs...</h3>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  AI is analyzing your execution logs to provide insights and recommendations.
                </p>
                <div className="mt-4 w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
                </div>
              </div>
            ) : explanation ? (
              <div className="space-y-6">
                {/* Header with copy button */}
                <div className="flex items-center justify-between p-4 list-item-background-color rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Explanation Ready</span>
                  </div>
                  <AntdButton
                    onClick={copyExplanation}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Explanation
                  </AntdButton>
                </div>

                {/* Explanation content */}
                <div className="list-item-background-color rounded-lg p-6 shadow-sm">
                  <div 
                    className="prose prose-lg max-w-none text-gray-800 dark:text-gray-200 leading-relaxed dark:prose-invert"
                    style={{
                      lineHeight: '1.7',
                      fontSize: '16px'
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: renderExplanationHtml(explanation)
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <Brain className="h-16 w-16 tertiary-text mb-6" />
                <h3 className="text-2xl font-semibold mb-3 secondary-text">No Explanation Yet</h3>
                <p className="tertiary-text text-lg mb-6 max-w-md">
                  Click "Explain Logs" to generate an AI-powered explanation of your execution logs.
                </p>
                <AntdButton 
                  onClick={explainLogs} 
                  disabled={loading}
                  type="text"
                >
                  {loading ? (
                    <>
                      <Spin
                        indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />}
                        size="large"
                      />
                      Generating...
                    </>
                  ) : (
                    'Generate Explanation'
                  )}
                </AntdButton>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}