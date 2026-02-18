"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Button, Input, message, Modal } from 'antd';
import { MailOutlined, LockOutlined } from "@ant-design/icons";
import { validateEmailForUI, checkEmailAllowed } from "@/lib/frontend-email-validation";

type User = {
    id: string;
    name: string;
    email: string;
}

type AuthApi = {
    isAuthenticated: boolean;
    logout: () => void;
    getCurrentUser: (showLogin?: boolean) => Promise<User | null>;
    setCurrentUser: (user: User | null) => void;
    showLogin: boolean;
    setShowLogin: (show: boolean) => void;
    hasInitialised: boolean;
    currentUser: any
    settleWait: (isCancelled?: boolean) => void;
    showLogoutModal: boolean;
    setShowLogoutModal: (show: boolean) => void;
    setIsAuthenticated: (isAuthenticated: boolean) => void;
}

export const AuthContext = createContext<AuthApi | null>(null);

export function createLogin(): AuthApi {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [showLogin, setShowLogin] = useState(false);
    const [hasInitialised, setHasInitialised] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const logout = () => {
        setShowLogoutModal(true);
    }

    const settleWait = useCallback((isCancelled: boolean = false) => {
        setIsAuthenticated(Boolean(currentUser));
        if (waitForLoginRef.current?.length === 2) {
            try {
                if (currentUser) {
                    waitForLoginRef.current[0](currentUser);
                } else if (isCancelled) {
                    // User cancelled login, reject with a cancellation error
                    waitForLoginRef.current[1](new Error('Login cancelled'));
                } else {
                    // Login attempt failed
                    waitForLoginRef.current[1](new Error('Login failed'));
                }
            } catch (e) {
                // Silently handle errors in callbacks to prevent unhandled promise rejections
                console.error('Error in settleWait callback:', e);
            } finally {
                waitForLoginRef.current = null;
            }
        }
    }, [currentUser]);

    useEffect(() => {
        settleWait();
    }, [settleWait]);

    const waitForLoginRef = useRef<any>(null);
    const getCurrentUserRef = useRef<((showLogin?: boolean) => Promise<any>) | null>(null);
    
    const getCurrentUser = useCallback(async (showLogin: boolean = true) => {
        let result: any = null;
        const response = await fetch('/api/authentication/me');
        const data = await response.json();
        if (data?.currentUser) {
            result = data?.currentUser;
        }

        setHasInitialised(true);

        if (!result) {
            if (showLogin === true) {
                setShowLogin(true);
                return new Promise((resolve, reject) => {
                    waitForLoginRef.current = [resolve, reject];
                })
            }
        }

        setCurrentUser(result);
        
        // Register socket user if available
        if (result && typeof window !== 'undefined') {
            import('@/lib/socket').then(({ registerSocketUser }) => {
                registerSocketUser(result._id, result.email);
            }).catch(() => {
                // Silently fail if socket module is not available
            });
        }

        return result;
    }, []);

    // Store the function in a ref to avoid recreation
    getCurrentUserRef.current = getCurrentUser;

    useEffect(() => {
        if (getCurrentUserRef.current) {
            getCurrentUserRef.current(false).catch(console.error);
        }
    }, []); // Empty dependency array - only run once

    return {
        isAuthenticated,
        logout,
        getCurrentUser,
        setCurrentUser,
        setIsAuthenticated,
        showLogin,
        setShowLogin,
        hasInitialised,
        currentUser,
        settleWait,
        showLogoutModal,
        setShowLogoutModal
    }
}

function Login() {
    const { setCurrentUser, setShowLogin } = useAuth();
    const [isSignup, setIsSignup] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForgotPassword, setShowForgotPassword] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isLoading) return;

        setError(null);

        // Frontend email validation
        const trimmedEmail = email.trim().toLowerCase();
        const emailValidation = validateEmailForUI(trimmedEmail);
        if (!emailValidation.isValid) {
            setError(emailValidation.error || 'Please enter a valid email address');
            return;
        }

        if (!password.trim()) {
            setError('Please enter your password');
            return;
        }

        // Check if email is allowed (frontend validation)
        const emailAllowed = await checkEmailAllowed(trimmedEmail);
        if (!emailAllowed.allowed) {
            setError(emailAllowed.error || 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.');
            return;
        }

        setIsLoading(true);
        try {
            // Capture UTM parameters
            const { getUTMParams } = await import('@/lib/utm-persistence');
            const utmParams = getUTMParams();

            const endpoint = isSignup ? '/api/authentication/signup' : '/api/authentication/login';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: trimmedEmail,
                    password,
                    name: isSignup ? name.trim() : undefined,
                    utm_source: utmParams.utm_source,
                    utm_medium: utmParams.utm_medium,
                    utm_campaign: utmParams.utm_campaign
                }),
            });

            const data = await response.json();

            if (response.ok) {
                const { user, isNewUser } = data;

                // Token is set as httpOnly cookie by the server
                setCurrentUser(user);
                setShowLogin(false);


                // Check for pricing redirect
                if (typeof window !== 'undefined') {
                    const pricingRedirect = sessionStorage.getItem('pricingRedirect');
                    if (pricingRedirect) {
                        sessionStorage.removeItem('pricingRedirect');
                        try {
                            const decoded = decodeURIComponent(pricingRedirect);
                            if (decoded.startsWith('/') && !decoded.startsWith('//') && 
                                !decoded.toLowerCase().includes('javascript:') && 
                                !decoded.toLowerCase().includes('data:')) {
                                window.location.href = decoded;
                            } else {
                                window.location.href = '/?settingsModal=subscription&tab=plans';
                            }
                        } catch {
                            window.location.href = '/?settingsModal=subscription&tab=plans';
                        }
                    }
                }
            } else {
                setError(data?.error || (isSignup ? 'Signup failed' : 'Login failed'));
            }
        } catch (e) {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 py-8 px-4">
            <div className="text-responsive-2xl font-semibold ai-gradient-text animate">
                Welcome to Turbotic Automation AI
            </div>
            
            {error && (
                <div className="w-full max-w-md border rounded-lg p-4 text-center bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <div className="text-red-600 dark:text-red-400 font-medium text-sm">
                        {error}
                    </div>
                </div>
            )}

            <form onSubmit={handleLogin} className="w-full max-w-md space-y-4">
                {isSignup && (
                    <div className="space-y-2">
                        <Input
                            placeholder="Name (optional)"
                            size="large"
                            prefix={<MailOutlined className="text-gray-400" />}
                            className="rounded-lg"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (error) setError(null);
                            }}
                            disabled={isLoading}
                        />
                    </div>
                )}
                
                <div className="space-y-2">
                    <Input
                        placeholder="Email"
                        type="email"
                        size="large"
                        prefix={<MailOutlined className="text-gray-400" />}
                        className="rounded-lg"
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (error) setError(null);
                        }}
                        disabled={isLoading}
                        required
                    />
                </div>
                
                <div className="space-y-2">
                    <Input.Password
                        placeholder="Password"
                        size="large"
                        prefix={<LockOutlined className="text-gray-400" />}
                        className="rounded-lg"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) setError(null);
                        }}
                        disabled={isLoading}
                        required
                    />
                    {!isSignup && (
                        <div className="text-right">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowForgotPassword(true);
                                    setError(null);
                                }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                disabled={isLoading}
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}
                </div>

                <Button
                    loading={isLoading}
                    type="primary"
                    htmlType="submit"
                    disabled={isLoading || !email.trim() || !password.trim()}
                    size="large"
                    block
                    className="border-0 rounded-lg h-12 text-base font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                    {isLoading ? (isSignup ? 'Creating Account...' : 'Signing In...') : (isSignup ? 'Sign Up' : 'Sign In')}
                </Button>

                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => {
                            setIsSignup(!isSignup);
                            setError(null);
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        disabled={isLoading}
                    >
                        {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                </div>
            </form>

            <Modal
                title="Reset Password"
                open={showForgotPassword}
                onCancel={() => {
                    setShowForgotPassword(false);
                    setError(null);
                }}
                footer={null}
                destroyOnClose
            >
                <ForgotPasswordForm 
                    onSuccess={() => {
                        setShowForgotPassword(false);
                        message.success('If an account with that email exists, a password reset link has been sent.');
                    }}
                    onClose={() => {
                        setShowForgotPassword(false);
                        setError(null);
                    }}
                />
            </Modal>
        </div>
    )
}

function ForgotPasswordForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isLoading) return;

        setError(null);

        const trimmedEmail = email.trim().toLowerCase();
        const emailValidation = validateEmailForUI(trimmedEmail);
        if (!emailValidation.isValid) {
            setError(emailValidation.error || 'Please enter a valid email address');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/authentication/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: trimmedEmail }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => {
                    onSuccess();
                }, 2000);
            } else {
                setError(data?.error || 'Failed to send reset email. Please try again.');
            }
        } catch (e) {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="py-4">
                <div className="text-center text-green-600 dark:text-green-400 mb-4">
                    <div className="text-lg font-semibold mb-2">Email Sent!</div>
                    <div className="text-sm">
                        If an account with that email exists, a password reset link has been sent.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="border rounded-lg p-3 text-center bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                    <div className="text-red-600 dark:text-red-400 font-medium text-sm">
                        {error}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                    placeholder="Enter your email"
                    type="email"
                    size="large"
                    prefix={<MailOutlined className="text-gray-400" />}
                    className="rounded-lg"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                    }}
                    disabled={isLoading}
                    required
                    autoFocus
                />
            </div>

            <div className="flex gap-2 justify-end">
                <Button
                    onClick={onClose}
                    disabled={isLoading}
                >
                    Cancel
                </Button>
                <Button
                    type="primary"
                    htmlType="submit"
                    loading={isLoading}
                    disabled={isLoading || !email.trim()}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                    Send Reset Link
                </Button>
            </div>
        </form>
    );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const authApi = createLogin();

    return (
        <AuthContext.Provider value={authApi}>
            {children}
            <Modal
                footer={null}
                open={authApi.showLogin}
                destroyOnHidden={true}
                onCancel={() => {
                    authApi.setShowLogin(false);
                    authApi.setCurrentUser(null);
                    authApi.settleWait(true); // Pass true to indicate cancellation
                }}
            >
                <Login />
            </Modal>
            <Modal
                open={authApi.showLogoutModal}
                onCancel={() => authApi.setShowLogoutModal(false)}
                onOk={async () => {

                    // Token cookie is cleared by the server
                    authApi.setIsAuthenticated?.(false);
                    authApi.setCurrentUser?.(null);
                    authApi.setShowLogoutModal(false);
                    window.location.href = '/';
                }}
                title="Logout Confirmation"
                okText="Log Out"
                cancelText="Cancel"
                okButtonProps={{
                  className: "bg-blue-600 hover:bg-blue-700 text-white font-semibold border-0 shadow-none",
                  style: { boxShadow: "none" }
                }}
            >
                Are you sure you want to logout?
            </Modal>
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const authApi = useContext(AuthContext);
    if (!authApi) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    return authApi;
}