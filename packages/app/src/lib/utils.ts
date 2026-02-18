import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as json5 from 'json5';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLabel(name: string, args: any, status: 'done' | 'pending', steps: any[] = []) {
  let result: any = {
    label: name,
    tooltip: name
  }

  switch (name) {
    case 'search-web': {
      if (status === 'pending') {
        result.label = `Searching web: ${args.query}`;
      } else {
        result.label = `Searched web: ${args.query}`;
      }
      
      result.tooltip = args.query;
      return result;
    }
    case 'extract-content-from-url': {
      if (status === 'pending') {
        result.label = `Analysing search results`;
      } else {
        result.label = `Analysed search results`;
      }
      
      result.tooltip = args.url;

      return result;
    }
    case 'crawl-website': {
      if (status === 'pending') {
        result.label = `Analysing full website`;
      } else {
        result.label = `Analysed full website`;
      }

      result.tooltip = args.url;  

      return result;
    }
    case 'write-code-in-monaco-editor': {
      if (status === 'pending') {
        result.label = `Applying code`;
      } else {
        result.label = `Applied code`;
      }

      result.tooltip = args.code;
      return result;
    }
    case 'create-step': {
      if (status === 'pending') {
        result.label = `Creating step: ${args.name}`;
      } else {
        result.label = `Created step: ${args.name}`;
      }
      result.tooltip = args.name;
      return result;
    }
    case 'read-latest-code': {
      if (status === 'pending') {
        result.label = `Reading latest code`;
      } else {
        result.label = `Read latest code`;
      }
      return result;
    }
    case 'update-step-code':
    case 'update-step': {
      // Prefer human-friendly name if available
      const step = steps.find((s) => s.id === args.stepId);
      const stepName = step?.name || args.stepName || args.name || args.stepId;
      if (status === 'pending') {
        result.label = `Updating step: ${stepName}`;
      } else {
        result.label = `Updated step: ${stepName}`;
      }
      result.tooltip = args.code?.substring(0, 100) || '';
      result.stepId = args.stepId; // Pass stepId for view code functionality
      return result;
    }
    case 'delete-step': {
      const step = steps.find((s) => s.id === args.stepId);
      const stepName = step?.name || args.stepName || args.name || args.stepId;
      if (status === 'pending') {
        result.label = `Deleting step: ${stepName}`;
      } else {
        result.label = `Deleted step: ${stepName}`;
      }
      return result;
    }
    case 'set-script-trigger-mode': {
      result.label = `Configured script trigger mode`;
      return result;
    }
    case 'set-environment-variables': {
      result.label = `Environment variables set`;
      return result;
    }

    case 'review-code': {
      if (status === 'pending') {
        result.label = `Reviewing code`;
      } else {
        result.label = `Code reviewed`;
      }
      return result;
    }

    case 'plan-actions': {
      if (status === 'pending') {
        result.label = `Creating plan`;
      } else {
        result.label = `Plan created`;
      }
      result.tooltip = args.plan;
      return result;
    }

    default: {
      return result;
    }
  }
}

let cache: any = {};

export function clearAiMessageCache() {
  cache = {};
}

export function convertAIMessageToString(messages: any[], allItems: any[] = [], steps: any[] = []) {
  return (messages.reduce((acc, m, cIndex) => {
    if (m.type === 'ai') {
      if (m.data.tool_calls?.length > 0) {
        const result = m.data.tool_calls.map((call: any) => {
          const indexOfToolResponse = allItems.findIndex((item) => item?.data?.tool_call_id === call.id);
          const toolResponse = allItems[indexOfToolResponse];
          let response = encodeURIComponent(toolResponse?.data?.content || '');

          // If we found a tool response, the tool call is done (regardless of position)
          const status = indexOfToolResponse > -1 ? 'done' : 'pending';
          const { label, tooltip, stepId } = getLabel(call.name, call.args, status, steps);
          
          // Special handling for plan-actions to render as checklist
          if (call.name === 'plan-actions' && call.args?.plan) {
            const planText = call.args.plan;
            const planLines = planText.split('\n').filter((line: string) => line.trim());
            
            // First try to extract numbered list items
            let planItems = planLines
              .filter((line: string) => /^\d+\./.test(line.trim()))
              .map((line: string) => {
                const match = line.match(/^\d+\.\s*(.+)/);
                return match ? { title: match[1].trim() } : null;
              })
              .filter(Boolean);
            
            // If no numbered items found, try bullet points
            if (planItems.length === 0) {
              planItems = planLines
                .filter((line: string) => /^[-•*]\s/.test(line.trim()))
                .map((line: string) => {
                  const match = line.match(/^[-•*]\s*(.+)/);
                  return match ? { title: match[1].trim() } : null;
                })
                .filter(Boolean);
            }
            
            // If still no structured items, split by sentences or create single item
            if (planItems.length === 0) {
              // Remove the "Here is the plan to be taken:" prefix if present
              const cleanText = planText.replace(/^Here is the plan to be taken:\s*/i, '').trim();
              
              // Split by sentences ending with periods, or by line breaks
              const sentences = cleanText
                .split(/\.\s+/)
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 10) // Only include meaningful sentences
                .map((s: string) => s.endsWith('.') ? s : s + '.');
              
              if (sentences.length > 0) {
                planItems = sentences.map((sentence: string) => ({ title: sentence }));
              } else {
                // Fallback: create a single item with the entire plan
                planItems = [{ title: cleanText }];
              }
            }
            
            // Always render plan-actions as checklist if we have any items
            if (planItems.length > 0) {
              return [
                '```plan-json',
                JSON.stringify(planItems, undefined, ' '),
                '```'
              ].join('\n');
            }
          }
          
          return [
            '```tool-call',
            JSON.stringify({
              name: call.name,
              label,
              tooltip: '',
              args: {}, // call.args,
              id: call.id,
              status,
              response,
              stepId: stepId || undefined // Include stepId for view code functionality
            }, undefined, ' '),
            '```'
          ].join('\n')
        });

        cache[m.data.id] = result;
        acc.push(...result);
      } else {
        const result = cache[m.data.id];
        if (result) {
          acc.push(...result);
        }
      }

      let textContent = '';
      if (Array.isArray(m.data.content)) {
        textContent = m.data.content.map((c: any) => c.text).filter(Boolean).join('\n')
      } else {
        textContent = m.data.content;
      }

      if (textContent) {
        acc.push(textContent);
      }
    } else if (m.type === 'human') {
      acc.push(m.data.content);
    }

    return acc;
  }, [])).join('\n');
}

export function applyCodeEdits(currentCode: string, aiChatMessage: any[]) {
  try {
    let lines = currentCode.split('\n');
    let newCode: string | false = false;
    let envVars: string[] = [];
    let deps: string[] = [];
    for (const message of aiChatMessage) {
      if (message.type === 'ai') {
        if (message.data.tool_calls?.length > 0) {
          const setEnvironmentVariablesToolCall = message.data.tool_calls.find((call: any) => call.name === 'set-environment-variables');
          if (setEnvironmentVariablesToolCall?.args?.environmentVariables) {
            envVars = setEnvironmentVariablesToolCall.args.environmentVariables;
          } 

          // Legacy single code file handling
          const monacoEditorToolCall = message.data.tool_calls.find((call: any) => call.name === 'write-code-in-monaco-editor');
          if (monacoEditorToolCall?.args?.code) {
            lines = monacoEditorToolCall.args.code.split('\n');
            newCode = lines.join('\n');
          }

          // CRITICAL: Only use environment variables if they are actually provided
          // This prevents clearing existing environment variables when AI doesn't return any
          if (monacoEditorToolCall?.args?.environmentVariablesUsed && 
              Array.isArray(monacoEditorToolCall.args.environmentVariablesUsed) && 
              monacoEditorToolCall.args.environmentVariablesUsed.length > 0) {
            envVars = monacoEditorToolCall.args.environmentVariablesUsed;
          } 

          // CRITICAL: Only use dependencies if they are actually provided
          if (monacoEditorToolCall?.args?.dependenciesUsed && 
              Array.isArray(monacoEditorToolCall.args.dependenciesUsed) && 
              monacoEditorToolCall.args.dependenciesUsed.length > 0) {
            deps = monacoEditorToolCall.args.dependenciesUsed;
          }

          // New multi-step handling - collect from update-step-code and update-step calls
          const stepUpdateCalls = message.data.tool_calls.filter((call: any) => call.name === 'update-step-code' || call.name === 'update-step');
          for (const stepCall of stepUpdateCalls) {
            // Collect environment variables from step updates
            if (stepCall.args?.environmentVariablesUsed && 
                Array.isArray(stepCall.args.environmentVariablesUsed) && 
                stepCall.args.environmentVariablesUsed.length > 0) {
              envVars = [...new Set([...envVars, ...stepCall.args.environmentVariablesUsed])];
            }

            // Collect dependencies from step updates
            if (stepCall.args?.dependenciesUsed && 
                Array.isArray(stepCall.args.dependenciesUsed) && 
                stepCall.args.dependenciesUsed.length > 0) {
              const newDeps = stepCall.args.dependenciesUsed.map((d: any) => d.name);
              deps = [...new Set([...deps, ...newDeps])];
            }
          }

          // Mark that steps were updated (for UI refresh trigger)
          if (stepUpdateCalls.length > 0) {
            // Signal that steps were updated - the chat window will handle this
            newCode = 'STEPS_UPDATED';
          }
        }
      }
    }

    return [newCode, envVars, deps];
  } catch (e) {
    return [false, [], []];
  }
}

// Responsive scaling utilities
export function getDevicePixelRatio(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

export function getScreenSize(): { width: number; height: number } {
  if (typeof window !== 'undefined') {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    };
  }
  return { width: 1920, height: 1080 }; // Default fallback
}

export function getOptimalScaleFactor(): number {
  const dpr = getDevicePixelRatio();
  const { width } = getScreenSize();
  
  // Base scale factor based on screen width
  let scaleFactor = 1;
  
  if (width <= 480) {
    scaleFactor = 0.75;
  } else if (width <= 640) {
    scaleFactor = 0.8;
  } else if (width <= 768) {
    scaleFactor = 0.85;
  } else if (width <= 1024) {
    scaleFactor = 0.9;
  } else if (width <= 1280) {
    scaleFactor = 0.95;
  } else if (width <= 1536) {
    scaleFactor = 1;
  } else if (width <= 1920) {
    scaleFactor = 1.05;
  } else {
    scaleFactor = 1.1;
  }
  
  // Adjust for high DPI displays
  let dpiScale = 1;
  if (dpr >= 2) {
    dpiScale = 0.8;
  } else if (dpr >= 1.5) {
    dpiScale = 0.85;
  }
  
  // Special case for laptop screens (900x1440 with 1.8 DPI)
  if (width <= 900 && dpr >= 1.8) {
    scaleFactor = 0.8;
    dpiScale = 0.85;
  }
  
  return scaleFactor * dpiScale;
}

export function applyResponsiveScaling(): void {
  if (typeof window !== 'undefined') {
    const scaleFactor = getOptimalScaleFactor();
    document.documentElement.style.setProperty('--scale-factor', scaleFactor.toString());
    document.documentElement.style.setProperty('--dpi-scale', getDevicePixelRatio() >= 1.5 ? '0.85' : '1');
  }
}

export function setupResponsiveScaling(): void {
  if (typeof window !== 'undefined') {
    // Apply initial scaling
    applyResponsiveScaling();
    
    // Listen for window resize events
    let resizeTimeout: NodeJS.Timeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(applyResponsiveScaling, 100);
    });
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(applyResponsiveScaling, 100);
    });
  }
}

// Utility to get responsive class names
export function getResponsiveClasses(baseClass: string, responsiveClass: string): string {
  return `${baseClass} ${responsiveClass}`;
}

// Utility to check if device is high DPI
export function isHighDPI(): boolean {
  return getDevicePixelRatio() >= 1.5;
}

// Utility to check if device is mobile
export function isMobile(): boolean {
  if (typeof window !== 'undefined') {
    return window.innerWidth <= 768;
  }
  return false;
}

// Utility to check if device is tablet
export function isTablet(): boolean {
  if (typeof window !== 'undefined') {
    const width = window.innerWidth;
    return width > 768 && width <= 1024;
  }
  return false;
}

// Utility to check if device is desktop
export function isDesktop(): boolean {
  if (typeof window !== 'undefined') {
    return window.innerWidth > 1024;
  }
  return false;
}