import { useState, useEffect } from 'react';
import { useAuth } from '@/app/authentication';

export interface UserCapabilities {
  canChat: boolean;
  canRunCode: boolean;
  loading: boolean;
  error: string | null;
}

export function useUserCapabilities(): UserCapabilities {
  const { currentUser } = useAuth();
  const [capabilities, setCapabilities] = useState<UserCapabilities>({
    canChat: true,
    canRunCode: true,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchCapabilities = async () => {

      if (!currentUser?.email) {
        setCapabilities({
          canChat: true,
          canRunCode: true,
          loading: false,
          error: null
        });
        return;
      }

      try {
        const url = `/api/email-restrictions/capabilities?email=${encodeURIComponent(currentUser.email)}`;

        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();

          setCapabilities({
            canChat: data.canChat !== false, // Default to true
            canRunCode: data.canRunCode !== false, // Default to true
            loading: false,
            error: null
          });
        } else {
          const errorText = await response.text();
          // If API fails, default to allowing everything
          setCapabilities({
            canChat: true,
            canRunCode: true,
            loading: false,
            error: 'Failed to fetch capabilities'
          });
        }
      } catch (error) {
        // On error, default to allowing everything to avoid blocking users
        setCapabilities({
          canChat: true,
          canRunCode: true,
          loading: false,
          error: 'Error fetching capabilities'
        });
      }
    };

    fetchCapabilities();
  }, [currentUser?.email]);

  return capabilities;
}
