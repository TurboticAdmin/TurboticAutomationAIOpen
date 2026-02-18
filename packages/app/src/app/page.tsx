'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from './authentication';
import { toast } from '@/hooks/use-toast';
import LandingV2 from '@/components/LandingV2';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser, hasInitialised } = useAuth();
  const pricingRedirectChecked = useRef(false);
  const errorMessageShown = useRef(false);
  const landingViewTracked = useRef(false);

  // Track landing page view (once per session)
  useEffect(() => {
    if (!landingViewTracked.current && !currentUser) {
    }
  }, [currentUser]);

  // Handle error and message parameters from OAuth callbacks immediately
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    
    if ((errorParam || messageParam) && !errorMessageShown.current) {
      errorMessageShown.current = true;
      
      // Show error or message toast
      if (errorParam === 'email_not_allowed' || errorParam === 'access_blocked') {
        // Use message parameter if available, otherwise use default
        const errorMessage = messageParam || 
          (errorParam === 'access_blocked' 
            ? 'Access blocked due to excessive attempts. Please contact support.'
            : 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.');
        toast.error("Error", errorMessage);
      } else if (errorParam) {
        // Handle other error types
        const errorMessage = messageParam || `Authentication error: ${errorParam}`;
        toast.error("Error", errorMessage);
      } else if (messageParam) {
        // Show success message if no error
        toast.success(messageParam);
      }

      // Clean up URL parameters after showing the message
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('error');
      newUrl.searchParams.delete('message');
      router.replace(newUrl.pathname + newUrl.search);
    }
    
    // Reset error message flag when URL parameters are cleared
    if (!errorParam && !messageParam) {
      errorMessageShown.current = false;
    }
  }, [searchParams, router]);

  useEffect(() => {
    // Check for pricing redirect cookie after OAuth login (only when auth param is present)
    const authParam = searchParams.get('auth');
    
    // Reset the ref if auth param is not present (allows checking again on next OAuth login)
    if (!authParam) {
      pricingRedirectChecked.current = false;
    }
    
    if (hasInitialised && currentUser && authParam && (authParam === 'google' || authParam === 'microsoft') && !pricingRedirectChecked.current) {
      pricingRedirectChecked.current = true;
      const checkPricingRedirect = async () => {
        // First check if sessionStorage has pricingRedirect (user clicked plans before login)
        // This ensures we only redirect when user explicitly clicked on plans
        if (typeof window === 'undefined') return false;
        const sessionStorageRedirect = sessionStorage.getItem('pricingRedirect');
        if (!sessionStorageRedirect) {
          // User didn't click on plans, don't redirect even if cookie exists
          return false;
        }
        
        try {
          const response = await fetch('/api/pricing-redirect');
          if (response.ok) {
            const data = await response.json();
            // Only redirect if redirectUrl exists and is a valid string (meaning cookie was set)
            if (data.redirectUrl && typeof data.redirectUrl === 'string' && data.redirectUrl.trim() !== '') {
              // Clear sessionStorage since we're redirecting
              sessionStorage.removeItem('pricingRedirect');
              // Redirect to pricing page
              router.push(data.redirectUrl);
              return true;
            }
          }
        } catch (error) {
          console.error('Error checking pricing redirect:', error);
        }
        return false;
      };
      
      checkPricingRedirect();
    }

    const applyDiscountCode = async (code: string) => {
      try {
        const response = await fetch('/api/subscriptions/apply-discount-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discountCode: code }),
        });

        const data = await response.json();

        if (response.ok) {
          // Check if this is a Stripe promotion code
          if (data.isStripePromotion) {
            // Store promotion code in sessionStorage BEFORE creating checkout
            // This ensures it's available if user cancels checkout and upgrades later from settings
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('stripePromotionCode', data.promotionCode);
            }
            
            // Automatically create checkout for Basic tier with promotion code (same as button flow)
            toast.success("Promotion code validated! Opening checkout with discount applied.");
            try {
              // Fetch Stripe config to get the Basic plan default tier price ID
              const stripeConfigResponse = await fetch('/api/stripe/config');
              if (!stripeConfigResponse.ok) {
                throw new Error('Failed to fetch Stripe config');
              }
              const stripeConfig = await stripeConfigResponse.json();
              
              // Get the Basic plan default tier monthly price ID
              const basicDefaultTier = stripeConfig.priceTiers?.BASIC?.tiers?.find((t: any) => t.isDefault);
              if (!basicDefaultTier || !basicDefaultTier.stripePriceId) {
                throw new Error('Basic plan default tier not found');
              }
              
              const priceId = basicDefaultTier.stripePriceId;
              const returnUrl = `${window.location.origin}?settingsModal=subscription&tab=plans`;
              
              // Create checkout session with promo code pre-applied
              const checkoutResponse = await fetch('/api/subscriptions/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: currentUser.email,
                  name: currentUser.name,
                  priceId: priceId,
                  promotionCode: data.promotionCode,
                  returnUrl: returnUrl,
                }),
              });
              
              if (!checkoutResponse.ok) {
                const errorData = await checkoutResponse.json();
                const errorMessage = errorData.error || 'Failed to create checkout session';
                console.error('Checkout error:', errorMessage);
                toast.error("Error", errorMessage);
                throw new Error(errorMessage);
              }
              
              const checkoutResult = await checkoutResponse.json();
              
              // Check if checkout was created successfully
              if (!checkoutResult.url) {
                throw new Error('No checkout URL returned');
              }
              
              // Remove discount parameter from URL before redirecting
              // Note: Since we're navigating away with window.location.href, we can update the URL
              // directly without needing router.replace (which would be overridden anyway)
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('discount');
              // Update URL in browser history before navigating away
              window.history.replaceState({}, '', newUrl.pathname + newUrl.search);
              
              // Redirect to Stripe checkout
              // Note: Promotion code remains in sessionStorage in case user cancels
              // It will be cleared when successfully used in settings-billing.tsx
              window.location.href = checkoutResult.url;
            } catch (checkoutError) {
              console.error("Error initiating checkout:", checkoutError);
              toast.error("Error", checkoutError instanceof Error ? checkoutError.message : "Failed to initiate checkout. Please try again.");
              // Don't clear sessionStorage on error - keep code available for retry
            }
          } else if (data.requiresPayment) {
            // For paid custom tiers, show success message and redirect to pricing modal
            toast.success(data.message);
            router.push('/?pricing=true');
          } else {
            // For free custom tiers, show success and remove discount parameter from URL
            toast.success(data.message);
            // Remove discount parameter from URL and stay on current page
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('discount');
            router.replace(newUrl.pathname + newUrl.search);
          }
        } else {
          toast.error("Error", data.error || 'Invalid discount code');
        }
      } catch (error) {
        toast.error("Error", "Failed to apply discount code");
      }
    };

    // Handle discount code parameter
    const discountCode = searchParams.get('discount');

    if (discountCode && hasInitialised && currentUser) {
      // User is authenticated, apply the discount code (will auto-create checkout for Stripe promotions)
      applyDiscountCode(discountCode);
    } else if (discountCode && hasInitialised && !currentUser) {
      // User not authenticated - store checkout intent for after login (similar to button flow)
      if (typeof window !== 'undefined') {
        // Validate and store the discount code for later use
        // We'll validate it after login, but store it now so OAuth can preserve it
        // The discount code will be preserved through OAuth via the state parameter
      }
    }

    // Handle settingsModal parameter - allow settings modal to open on current page
    const settingsModal = searchParams.get('settingsModal');
    const stripeReturn = searchParams.get('stripe_return');
    const sessionId = searchParams.get('session_id');

    if (settingsModal && hasInitialised && !currentUser) {
      // If user is not authenticated, stay on home page (login handled by LandingV2)
      // No redirect needed
    }
    // Note: settingsModal is now handled by Sidebar component, so we don't redirect
    // This allows the modal to open on any page where Sidebar is available
  }, [searchParams, hasInitialised, currentUser, router]);

  return <LandingV2 />;
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
