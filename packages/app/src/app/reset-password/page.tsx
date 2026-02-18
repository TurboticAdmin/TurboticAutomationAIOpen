'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input, Button, message } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { validateEmailForUI } from '@/lib/frontend-email-validation';

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');
    
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('Invalid reset link. Please request a new password reset.');
        }
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!token) {
            setError('Invalid reset link. Please request a new password reset.');
            return;
        }

        if (isLoading) return;

        setError(null);

        // Validate password
        if (password.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/authentication/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(true);
                message.success('Password has been reset successfully');
                setTimeout(() => {
                    router.push('/');
                }, 2000);
            } else {
                setError(data?.error || 'Failed to reset password. The link may have expired.');
            }
        } catch (e) {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
                <div className="max-w-md w-full mx-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                        <div className="text-green-600 dark:text-green-400 mb-4">
                            <div className="text-2xl font-semibold mb-2">Password Reset Successful!</div>
                            <div className="text-sm">Redirecting to login...</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
            <div className="max-w-md w-full mx-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                    <h1 className="text-2xl font-semibold mb-6 text-center ai-gradient-text">
                        Reset Your Password
                    </h1>

                    {error && (
                        <div className="mb-4 border rounded-lg p-3 text-center bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                            <div className="text-red-600 dark:text-red-400 font-medium text-sm">
                                {error}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">New Password</label>
                            <Input.Password
                                placeholder="Enter new password (min. 8 characters)"
                                size="large"
                                prefix={<LockOutlined className="text-gray-400" />}
                                className="rounded-lg"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (error) setError(null);
                                }}
                                disabled={isLoading || !token}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Confirm Password</label>
                            <Input.Password
                                placeholder="Confirm new password"
                                size="large"
                                prefix={<LockOutlined className="text-gray-400" />}
                                className="rounded-lg"
                                value={confirmPassword}
                                onChange={(e) => {
                                    setConfirmPassword(e.target.value);
                                    if (error) setError(null);
                                }}
                                disabled={isLoading || !token}
                                required
                            />
                        </div>

                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={isLoading}
                            disabled={isLoading || !token || !password.trim() || !confirmPassword.trim()}
                            size="large"
                            block
                            className="border-0 rounded-lg h-12 text-base font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        >
                            Reset Password
                        </Button>

                        <div className="text-center">
                            <button
                                type="button"
                                onClick={() => router.push('/')}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                disabled={isLoading}
                            >
                                Back to Login
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
                <div className="max-w-md w-full mx-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
                        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
                    </div>
                </div>
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}

