import { useEffect, useMemo, useState } from "react";
import useAutomationEditor from "../hooks/automation-editor";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";

export default function LogExplainer() {
    const automationEditor = useAutomationEditor();
    const { currentExecutionId, isTesting, logExplanation, chatLoading, setLogExplanation } = automationEditor;
    const [description, setDescription] = useState('');
    const [upNext, setUpNext] = useState('');

    useEffect(() => {
        if (chatLoading === true) {
            setLogExplanation(null);
        }
    }, [chatLoading])

    useEffect(() => {
        if (isTesting === true) {
            setDescription('The automation is running');
            setUpNext('Please wait for the automation to complete');
        }
    }, [isTesting]);

    useEffect(() => {
        if (logExplanation) {
            setDescription(logExplanation.explanation);
            setUpNext(logExplanation.whatToDoNext);
        }
    }, [logExplanation]);

    return (
        <div className="log-explainer">
            {
                Boolean(logExplanation) ? (
                    <>
                        <label className="label">
                            Current Status:
                                <span className="tag" style={{
                                backgroundColor: logExplanation.isErrored === true ? '#ffe6e6' : logExplanation.hasFinished === true ? '#e6ffe6' : '#e6f4ff',
                                color: logExplanation.isErrored === true ? 'var(--progress-indicator-red)' : logExplanation.hasFinished === true ? '#52c41a' : '#2563eb',
                            }}>
                                {logExplanation.isErrored === true ? 
                                    <AlertCircle size={14} /> : logExplanation.hasFinished === true ? <CheckCircle size={14} /> : <Spin indicator={<LoadingOutlined spin style={{ fontSize: 14 }} />} size="small" />}
                                {logExplanation.isErrored === true ? 'Automation Errored' : logExplanation.hasFinished === true ? 'Automation Completed' : 'Automation Running'}
                            </span>
                        </label>
                        
                        {description && (
                            <>
                                <label className="description-header">Description:</label>
                                <div className="description">{description}</div>
                            </>
                        )}
                        {upNext && (
                            <>
                                <label className="description-header">Up Next:</label>
                                <div className="description">{upNext}</div>
                            </>
                        )}
                    </>
                ) : isTesting === true ? (
                    <>
                        <label className="label">
                            Current Status:
                            <span className="tag" style={{ backgroundColor: '#e6f4ff', color: '#2563eb' }}>
                                <Spin indicator={<LoadingOutlined spin style={{ fontSize: 14 }} />} size="small" />
                                {'Running'}
                            </span>
                        </label>
                    </>
                ) : chatLoading === true ? (
                    <>
                        <label className="label">
                            Current Status:
                            <span className="tag" style={{ backgroundColor: '#ffe6e6', color: 'var(--progress-indicator-orange)'}}>
                                <Clock size={14} />
                                Chat in progress
                            </span>
                        </label>
                    </>
                ) : (
                    <>
                        <label className="label">
                            Current Status:
                            <span className="tag"
                                style={{
                                    backgroundColor: '#e6ffe6',
                                    color: '#52c41a',
                                }}
                            >
                                <CheckCircle size={14} />
                                {'Ready to run'}
                            </span>
                        </label>
                    </>
                )
            }
        </div>
    );
}