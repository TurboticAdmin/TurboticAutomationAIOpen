'use client';

import { CloseOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState, useRef, useEffect } from 'react';
import useAutomationEditor from '../hooks/automation-editor';
import { useTheme } from '@/contexts/ThemeContext';

function Monitor({ isDark }: { isDark: boolean }) {
    const { currentExecutionId, screenshots, setScreenshots } = useAutomationEditor();

    useEffect(() => {
        if (currentExecutionId) {
            const fetchScreenshots = async () => {
                try {
                    const res = await fetch(`/api/screenshots?executionId=${currentExecutionId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setScreenshots(data);
                    }
                } catch (error) {
                    // Silently handle errors - screenshots may not exist yet
                    console.debug('Screenshot fetch error:', error);
                }
            };

            fetchScreenshots();
    
            const interval = setInterval(fetchScreenshots, 1 * 1000);
    
            return () => clearInterval(interval);
        }
    }, [currentExecutionId, setScreenshots]);

    return (
        <div style={{
            width: '100%',
            height: '100%',
            backgroundImage: screenshots.length > 0 ? `url(data:image/png;base64,${screenshots[screenshots.length - 1]})` : 'none',
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? '#363636' : '#f5f5f5'
        }}>
            {
                screenshots.length < 1 ? (
                    <div style={{
                        color: isDark ? '#ffffff' : '#000000',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        No preview available
                    </div>
                ) : null
            }
        </div>
    )
}

export default function BrowserScreen() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const componentWidth = 500;
    const componentHeight = 300;
    
    // Initialize position to center-top
    const getInitialPosition = () => {
        if (typeof window !== 'undefined') {
            return {
                x: (window.innerWidth - componentWidth) / 2,
                y: 80 // Top position with some margin
            };
        }
        return { x: 0, y: 0 };
    };

    const [position, setPosition] = useState(getInitialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const elementRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const { setShowBrowserScreen } = useAutomationEditor();

    // Update position on window resize to keep it centered
    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.max(0, Math.min(prev.x, window.innerWidth - componentWidth)),
                y: Math.max(0, Math.min(prev.y, window.innerHeight - componentHeight))
            }));
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Don't start dragging if clicking the close button
        if ((e.target as HTMLElement).closest('button')) {
            return;
        }
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
        setIsDragging(true);
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            // Calculate new position
            let newX = e.clientX - dragOffset.x;
            let newY = e.clientY - dragOffset.y;
            
            // Constrain to screen boundaries
            newX = Math.max(0, Math.min(newX, window.innerWidth - componentWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - componentHeight));
            
            setPosition({
                x: newX,
                y: newY
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, dragOffset]);

    return <div
        ref={elementRef}
        style={{
            position: 'fixed',
            top: position.y,
            left: position.x,
            width: `${componentWidth}px`,
            height: `${componentHeight}px`,
            borderRadius: '8px',
            backgroundColor: isDark ? '#2d2d2d' : '#ffffff',
            border: `1px solid ${isDark ? '#4a4a4a' : '#d9d9d9'}`,
            userSelect: 'none',
            zIndex: isDragging ? 1001 : 1000,
            overflow: 'hidden',
            boxShadow: isDark 
                ? '0 4px 16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)' 
                : '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column'
        }}
    >
        {/* Header */}
        <div
            ref={headerRef}
            onMouseDown={handleMouseDown}
            style={{
                padding: '12px 16px',
                backgroundColor: isDark ? '#3a3a3a' : '#fafafa',
                borderBottom: `1px solid ${isDark ? '#4a4a4a' : '#e8e8e8'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: isDragging ? 'grabbing' : 'grab',
                flexShrink: 0
            }}
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: isDark ? '#ffffff' : '#000000',
                fontWeight: 500,
                fontSize: '14px'
            }}>
                <span>🌐</span>
                <span>Browser Preview</span>
            </div>
            <Button 
                onClick={(e) => {
                    e.stopPropagation();
                    setShowBrowserScreen(false);
                }}
                type="text"
                size="small"
                style={{
                    color: isDark ? '#ffffff' : '#000000',
                    padding: '4px'
                }}
            >
                <CloseOutlined />
            </Button>
        </div>
        
        {/* Monitor Content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
            <Monitor isDark={isDark} />
        </div>
    </div>;
}