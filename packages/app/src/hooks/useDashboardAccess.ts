import { useEffect, useState } from 'react';
import { useAuth } from '@/app/authentication';

export function useDashboardAccess() {
  const { isAuthenticated, currentUser } = useAuth();
  const [hasDashboardAccess, setHasDashboardAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      // Wait for authentication to be fully resolved
      if (isAuthenticated === undefined || (isAuthenticated && !currentUser)) {
        return; // Still loading authentication, don't proceed
      }

      if (!isAuthenticated || !currentUser) {
        setHasDashboardAccess(false);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/dashboards/access-check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // Send empty JSON body
        });

        if (response.ok) {
          const { hasAccess } = await response.json();
          setHasDashboardAccess(hasAccess);
        } else {
          setHasDashboardAccess(false);
        }
      } catch (error) {
        console.error('Error checking dashboard access:', error);
        setHasDashboardAccess(false);
      } finally {
        setLoading(false);
      }
    }

    checkAccess();
  }, [isAuthenticated, currentUser]);

  return { hasDashboardAccess, loading };
}