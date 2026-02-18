import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentCodeValue } from "./code-editor-stable";
import { socket } from '@/lib/socket';
import useAutomationEditor from "../hooks/automation-editor";
import { useTheme } from "@/contexts/ThemeContext";

const terminalTheme = {
    background: '#ffffff',              // soft light background
    foreground: '#000000',              // base text (cool gray-blue)
    cursor: '#657b83',                  // darker gray-blue for visibility
    cursorAccent: '#fdf6e3',            // cursor text color (same as bg)
    selectionBackground: '#dbeaf7',     // light blue selection
    selectionForeground: '#000000',     // black text when selected
    selectionInactiveBackground: '#e5e5e5',

    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',

    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',

    extendedAnsi: undefined // Only needed if you define 256+ colors manually
}

const terminalThemeDark = {
    ...terminalTheme,
    background: '#000',
    foreground: '#fff',
}

export default function OutputController() {
    const { activeTab } = useAutomationEditor();
    const divRef = useRef<HTMLDivElement>(null);

    const automationEditor = useAutomationEditor();
    const { currentExecutionId } = automationEditor;
    const { theme } = useTheme();

    const refreshLog = useCallback((executionId: string) => {
        fetch(`/api/run/logs?executionId=${executionId}`)
            .then((res) => res.json())
            .then((json) => {
                json.forEach((log: string) => {
                    automationEditor.writeTerminalLine(log);
                });
            })
            .catch((e) => console.error(e));
    }, []);

    useEffect(() => {
        if (currentExecutionId) {
            refreshLog(currentExecutionId);

            socket.emit('join-room', `execution-${currentExecutionId}`);

            const executionHandler = (payload: any) => {
                if (Array.isArray(payload?.logs)) {
                    payload.logs.forEach((log: string) => {
                        automationEditor.writeTerminalLine(log);
                    });
                }
            }

            socket.on('execution:log', executionHandler);

            socket.on('connect', () => {
                socket.emit('join-room', `execution-${currentExecutionId}`);
            });

            return () => {
                socket.off('execution:log', executionHandler);
                socket.emit('leave-room', `execution-${currentExecutionId}`);
            }
        }
    }, [currentExecutionId, refreshLog]);

    useEffect(() => {
        if (divRef.current && automationEditor.terminal.current) {
            automationEditor.terminal.current.loadAddon(automationEditor.fitAddon.current);
            automationEditor.terminal.current.open(divRef.current);
            automationEditor.fitAddon.current.fit();
            
            // Process any queued logs after terminal is attached to DOM
            if (automationEditor.terminal.current) {
                automationEditor.terminal.current.writeln('Terminal ready - logs will appear here');
            }
        }
    }, [automationEditor.terminal.current]);

    useEffect(() => {
        const resize = () => {
            if (automationEditor.fitAddon.current) {
                automationEditor.fitAddon.current.fit();
            }
        }
        window.addEventListener('resize', resize);
        return () => {
            window.removeEventListener('resize', resize);
        }
    }, [automationEditor.fitAddon.current]);

    useEffect(() => {
        if (automationEditor.terminal.current?.options) {
            automationEditor.terminal.current.options.theme = theme === 'dark' ? terminalThemeDark : terminalTheme;
        }
    }, [theme])


    useEffect(() => {
        if (activeTab === 'logs' && automationEditor.fitAddon.current) {
            automationEditor.fitAddon.current.fit();
        }
    }, [activeTab]);

    return (
        <div ref={divRef} style={{
            height: '100%',
            width: '100%',
            overflow: 'auto',
        }}>
            {/* {
                runLogs.map((log, index) => {
                    return <div key={index}>{log}</div>
                })
            } */}
        </div>
    );
}
