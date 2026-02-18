import { useState, useEffect } from 'react';
import { useAuth } from '@/app/authentication';

interface OnboardingState {
  hasCompletedTour: boolean;
  tourStarted: boolean;
  tourStep: number;
  lastUpdated: Date;
}

interface UseOnboardingReturn {
  onboardingState: OnboardingState | null;
  loading: boolean;
  error: string | null;
  tourEnabled: boolean;
  updateOnboardingState: (updates: Partial<OnboardingState>) => Promise<void>;
  resetOnboardingState: () => Promise<void>;
  continueOnboardingTour: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tourEnabled, setTourEnabled] = useState(false);
  const { isAuthenticated, currentUser } = useAuth();

  // Load onboarding state when component mounts or user changes
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      loadOnboardingState();
    } else {
      setOnboardingState(null);
      setLoading(false);
    }
  }, [isAuthenticated, currentUser]);

  const loadOnboardingState = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both onboarding state and config in parallel with error handling
      const [onboardingResult, configResult] = await Promise.allSettled([
        fetch('/api/user/onboarding', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        fetch('/api/user/onboarding/config', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      ]);

      // Handle onboarding state response
      if (onboardingResult.status === 'fulfilled') {
        const response = onboardingResult.value;
        if (response.ok) {
          try {
            const data = await response.json();
            if (data.success) {
              setOnboardingState(data.onboardingState);
            } else {
              console.warn('Onboarding state response not successful:', data.error);
              // Set defaults if response indicates failure
              setOnboardingState({
                hasCompletedTour: false,
                tourStarted: false,
                tourStep: 0,
                lastUpdated: new Date()
              });
            }
          } catch (parseErr) {
            console.error('Error parsing onboarding state response:', parseErr);
            // Set defaults on parse error
            setOnboardingState({
              hasCompletedTour: false,
              tourStarted: false,
              tourStep: 0,
              lastUpdated: new Date()
            });
          }
        } else {
          console.warn(`Onboarding state fetch returned status ${response.status}`);
          // Set defaults on non-OK response
          setOnboardingState({
            hasCompletedTour: false,
            tourStarted: false,
            tourStep: 0,
            lastUpdated: new Date()
          });
        }
      } else {
        // Fetch failed - set defaults
        console.warn('Onboarding state fetch failed:', onboardingResult.reason);
        setOnboardingState({
          hasCompletedTour: false,
          tourStarted: false,
          tourStep: 0,
          lastUpdated: new Date()
        });
      }

      // Handle config response
      if (configResult.status === 'fulfilled') {
        const response = configResult.value;
        if (response.ok) {
          try {
            const configData = await response.json();
            setTourEnabled(configData.tourEnabled ?? false);
          } catch (parseErr) {
            console.warn('Error parsing config response:', parseErr);
            setTourEnabled(false);
          }
        } else {
          console.warn(`Config fetch returned status ${response.status}`);
          setTourEnabled(false);
        }
      } else {
        console.warn('Config fetch failed:', configResult.reason);
        setTourEnabled(false);
      }
    } catch (err) {
      console.error('Error loading onboarding state:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');

      // Set default state on error
      setOnboardingState({
        hasCompletedTour: false,
        tourStarted: false,
        tourStep: 0,
        lastUpdated: new Date()
      });
      setTourEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  const updateOnboardingState = async (updates: Partial<OnboardingState>) => {
    try {
      setError(null);

      const response = await fetch('/api/user/onboarding', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update onboarding state: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setOnboardingState(data.onboardingState);
      } else {
        throw new Error(data.error || 'Failed to update onboarding state');
      }
    } catch (err) {
      console.error('Error updating onboarding state:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const resetOnboardingState = async () => {
    try {
      setError(null);

      const response = await fetch('/api/user/onboarding', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to reset onboarding state: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setOnboardingState(data.onboardingState);
      } else {
        throw new Error(data.error || 'Failed to reset onboarding state');
      }
    } catch (err) {
      console.error('Error resetting onboarding state:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const continueOnboardingTour = async () => {
    await updateOnboardingState({
      hasCompletedTour: false,
      tourStarted: true,
      tourStep: 0
    });
  };

  return {
    onboardingState,
    loading,
    error,
    tourEnabled,
    updateOnboardingState,
    resetOnboardingState,
    continueOnboardingTour
  };
}
