// Shared utility functions for automation operations

export interface AutomationForFilter {
  id: string;
  title: string;
  status?: string;
  scheduleCount?: number;
  totalRuns?: number;
  successfulRuns?: number;
}

/**
 * Fetches all automations for filter dropdowns
 * Used by both Automations page and Execution History component
 */
export const fetchAllAutomationsForFilter = async (): Promise<AutomationForFilter[]> => {
  try {
    const response = await fetch('/api/get-all-automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1000, offset: 0, search: '' }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch automations: ${response.status}`);
    }

    const data = await response.json();
    const automations = data?.items || [];
    
    return automations.map((automation: any) => ({
      id: automation.id || automation._id || '',
      title: automation.title,
      status: automation.status,
      scheduleCount: automation.scheduleCount,
      totalRuns: automation.totalRuns,
      successfulRuns: automation.successfulRuns
    }));
  } catch (error) {
    console.error('Error fetching automations for filter:', error);
    return [];
  }
};
