"use client";

import { io } from "socket.io-client";

// Get socket URL from environment variable or construct from current hostname
const getSocketUrl = () => {
    // If NEXT_PUBLIC_SOCKET_URL is set, use it directly
    if (process.env.NEXT_PUBLIC_SOCKET_URL) {
        return process.env.NEXT_PUBLIC_SOCKET_URL;
    }
    
    // Otherwise, construct from current hostname
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const port = window.location.port || (protocol === 'wss:' ? '443' : '3001');
        return `${protocol}//${hostname}${port && port !== '80' && port !== '443' ? `:${port}` : ''}`;
    }
    
    // Fallback for server-side
    return 'ws://localhost:3001';
};

const url = getSocketUrl();


export const socket = io(url);

// Store last known user info for re-registration on reconnect
let lastKnownUser: { userId?: string; email?: string } | null = null;

socket.on('connect', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Socket connected', socket.id);
    }

    // Re-register user if we have cached user info
    if (lastKnownUser?.userId || lastKnownUser?.email) {
        socket.emit('register-user', lastKnownUser);
    }
});

socket.on('disconnect', () => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Socket disconnected', socket.id);
    }
});

// Function to register user information with the socket
export function registerSocketUser(userId?: string, email?: string) {
    if (!userId && !email) {
        return;
    }

    // Store user info for re-registration on reconnect
    lastKnownUser = { userId, email };

    // Register immediately if connected
    if (socket.connected) {
        socket.emit('register-user', { userId, email });
    } else {
        console.log('Socket not connected yet, will register on connect');
    }
}