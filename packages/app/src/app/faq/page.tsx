'use client';

import { useState, useEffect } from 'react';
import { Input, Collapse, Badge } from 'antd';
import { CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { SearchInput } from '@/components/ui/search-input';
import { SiDiscord, SiLinkedin } from 'react-icons/si';
// import { SiReddit } from 'react-icons/si'; // Temporarily removed - will re-add later
import { HiMail } from 'react-icons/hi';
import { useTheme } from '@/contexts/ThemeContext';
import './style.scss';


// Popular/Most Asked questions
const popularQuestions = [
  { section: 'getting-started', index: 0 },
  { section: 'getting-started', index: 1 },
  { section: 'features', index: 1 },
  { section: 'features', index: 2 },
  { section: 'admin-security', index: 2 },
];

const faqData = [
  {
    key: 'getting-started',
    title: 'Getting Started',
    icon: 'getting-started',
    items: [
      {
        question: 'What is Turbotic Automation AI?',
        answer: 'An AI-powered automation platform that lets anyone create automations by simply typing what they want. It supports everything from simple tasks to complex multi-step workflows.'
      },
      {
        question: 'How do I create my first automation?',
        answer: 'Just type your request in plain English into the prompt box (e.g., "Summarize my last 5 emails and send me a Word doc"), and Turbotic builds it for you.'
      },
      {
        question: 'Do I need coding skills?',
        answer: 'No — plain language is enough for most automations. But if you\'re a developer, you can dive into the code editor to customize further.'
      },
      {
        question: 'What\'s the best way to begin?',
        answer: 'Start small. Pick one task you repeat daily, automate it, and then scale from there.'
      }
    ]
  },
  {
    key: 'features',
    title: 'Features & Capabilities',
    icon: 'features',
    items: [
      {
        question: 'What kinds of tasks can I automate?',
        answer: 'You can automate almost anything that is repetitive, rule-based, or data-driven. Examples include:\n• Collecting and summarizing emails, texts, or meeting notes\n• Updating CRM, ERP, or project management systems\n• Generating reports and dashboards from different data sources\n• Translating, classifying, or tagging documents\n• Monitoring systems, alerts, or logs and sending notifications\n• Processing invoices, payments, or customer requests\n• Browser-based automations with visual progress tracking\n• File processing and data transformation\n\nThe idea is: if you can describe the task step-by-step, our AI can automate it.'
      },
      {
        question: 'Can I connect to my existing tools?',
        answer: 'Yes. Turbotic integrates with any enterprise or SaaS apps that have APIs like Outlook, Teams, SharePoint, HubSpot, Stripe, Jira, UiPath, ServiceNow, and many others. We also support Microsoft Graph API for seamless Office 365 integration.'
      },
      {
        question: 'Can I schedule automations?',
        answer: 'Yes — you can schedule automations instantly with a vibe. Just describe the schedule, timing frequency, and time zone, and the automation will be scheduled automatically. The system sends email notifications when scheduled automations complete or fail.'
      },
      {
        question: 'Does it support both simple and complex workflows?',
        answer: 'Absolutely. From quick daily summaries to multi-step enterprise workflows, Turbotic handles both. Use natural language prompts to describe complex processes with conditional logic and multiple triggers.'
      },
      {
        question: 'Can I share automations with my team?',
        answer: 'Yes! You can share automations with other users by providing their email address. Shared automations appear in the recipient\'s workspace with clear sharing indicators.'
      },
      {
        question: 'How do multi-step automations work?',
        answer: 'Automations can consist of multiple sequential steps. Each step can access data from previous steps using `getContext(key)` and share data with next steps using `setContext(key, value)`. Steps run in order and can be created, updated, or removed dynamically as needed.'
      }
    ]
  },
  {
    key: 'developers',
    title: 'For Developers',
    icon: 'developers',
    items: [
      {
        question: 'Can I edit the generated automation code?',
        answer: 'Yes. Turbotic provides a full code editor where you can adjust logic, add libraries, environment variables, and debug.'
      },
      {
        question: 'How do I test and debug?',
        answer: 'Every automation run shows logs, errors, and output. You can rerun, inspect failures, and refine easily looking at the logs.'
      },
      {
        question: 'Can I reuse or share automations?',
        answer: 'Yes — you can save automations in your workspace and reuse them whenever you need. Sharing them with your team when they needed.'
      },
      {
        question: 'Which languages or frameworks are supported?',
        answer: 'Automations are generated in Node.js/JavaScript, with support for APIs, npm libraries, and enterprise connectors.'
      },
      {
        question: 'How does version control work?',
        answer: 'Every time code is generated or updated, Turbotic automatically creates a version with semantic versioning (v1.0.0, v1.0.1, etc.). View version history, see diffs between versions, preview any version, and rollback to previous versions with one click.Optionally connect your GitHub repository to sync versions to GitHub.'
      },
      {
        question: 'Can I rollback to a previous version?',
        answer: 'Yes! Open the Version History drawer and select any previous version. Preview the code, see what changed, and click "Rollback" to restore that version. The system tracks dependencies and environment variables for each version.'
      },
      {
        question: 'How do I connect my GitHub repository?',
        answer: 'Connect a GitHub repository to automatically sync versions. In the automation settings, provide your GitHub repository owner, name, and a personal access token with repo permissions. Once connected, all versions will sync to GitHub automatically.'
      },
      {
        question: 'What gets synced to GitHub?',
        answer: 'When GitHub integration is enabled, each version syncs to your repository with:\n• Code files (single file or multi-file structure)\n• Version metadata (dependencies, environment variables)\n• Semantic version tags\n• Commit messages describing changes\n\nEach automation gets its own folder structure in the repository.'
      }
    ]
  },
  {
    key: 'integrations',
    icon: 'integrations',
    title: 'Integrations',
    items: [
      {
        question: 'Which Microsoft tools can I connect with Turbotic?',
        answer: 'Any Microsoft integration is possible — but a few are available out-of-the-box with preconfigured, one-time authentication for easier setup: Outlook, Teams, Calendar, and SharePoint to automate emails, meetings, documents, and collaboration tasks.'
      },
      {
        question: 'Do I need to set up integrations every time?',
        answer: 'No — once connected, your integration stays active. You can reuse it across multiple automations.'
      },
      {
        question: 'Can I pre-set integrations before building automations?',
        answer: 'Yes — you can connect Microsoft services in advance so they\'re ready whenever you create a new automation.'
      },
      {
        question: 'Can I disconnect an integration if I no longer need it?',
        answer: 'Yes — you have full control to disconnect or reconnect integrations at any time.'
      },
      {
        question: 'Are other integrations besides Microsoft planned?',
        answer: 'Yes — more popular apps and enterprise integrations are coming to be available out-of-the-box, but you can already connect to any integration today via code. This means you\'re not limited: prebuilt ones make setup and authentication faster, and custom code covers everything else.'
      },
      {
        question: 'Can I integrate with GitHub?',
        answer: 'Yes! Connect your GitHub repository to automatically sync automation versions. Each version is committed to GitHub with semantic versioning, commit messages, and metadata. Requires a GitHub personal access token with repo permissions.'
      }
    ]
  },
  // {
  //   key: 'marketplace',
  //   title: 'Marketplace',
  //   items: [
  //     {
  //       question: 'What is the Automation Marketplace?',
  //       answer: 'The Automation Marketplace is a community platform where you can discover, install, and publish automation scripts. Browse ready-made automations, read reviews, and find solutions built by other users.'
  //     },
  //     {
  //       question: 'How do I browse the marketplace?',
  //       answer: 'Visit the Marketplace page to browse automations by category, search by keywords, filter by price and ratings, and sort by popularity, rating, or recency. Use the advanced search for more specific results.'
  //     },
  //     {
  //       question: 'How do I install an automation from the marketplace?',
  //       answer: 'Click "Install" on any marketplace automation. The system automatically scans the code for security issues before installation. If safe, the automation is cloned to your workspace and ready to use. You can customize it after installation.'
  //     },
  //     {
  //       question: 'Is it safe to install marketplace automations?',
  //       answer: 'Yes! All marketplace automations undergo automatic security scanning before installation. The system detects dangerous patterns like eval(), file system manipulation, and other security risks. Environment variables are never copied to protect your secrets.'
  //     },
  //     {
  //       question: 'Can I publish my own automations to the marketplace?',
  //       answer: 'Yes! You can publish any of your automations to the marketplace. Provide a name, description, category, tags, pricing model, and media (icons, screenshots). Your automation will be available for others to discover and install.'
  //     },
  //     {
  //       question: 'How do reviews and ratings work?',
  //       answer: 'Users who install automations can leave reviews with 5-star ratings. Reviews can include pros, cons, and detailed feedback. Only users who actually installed an automation can review it to ensure authentic feedback.'
  //     },
  //     {
  //       question: 'Can I uninstall a marketplace automation?',
  //       answer: 'Yes! You can uninstall marketplace automations from your workspace. Choose to keep the automation data or completely remove it. Uninstall data is tracked for analytics and publisher insights.'
  //     },
  //     {
  //       question: 'What is a publisher dashboard?',
  //       answer: 'The publisher dashboard shows analytics for your published automations including views, installs, ratings, revenue, and performance metrics. Track how your automations are performing and engage with user reviews.'
  //     },
  //     {
  //       question: 'Can I update my published automation?',
  //       answer: 'Yes! Update your automation and publish new versions with semantic versioning and changelog tracking. Users who installed your automation can see available updates and choose to upgrade.'
  //     }
  //   ]
  // },
  {
    key: 'api-webhooks',
    icon: 'api-webhooks',
    title: 'API Triggers & Webhooks',
    items: [
      {
        question: 'Can I trigger automations via API?',
        answer: 'Yes! Use API keys to trigger automations remotely. The system returns an execution ID immediately, then you can poll for status and logs. Perfect for integrating with external systems.'
      },
      {
        question: 'How do webhook triggers work?',
        answer: 'Set up webhook endpoints that external services can call to trigger your automations. The webhook receives data that can be used as input for your automation logic.'
      },
      {
        question: 'What\'s the difference between API and webhook triggers?',
        answer: 'API triggers are for when you want to programmatically start an automation. Webhook triggers are for when external services need to notify your automation of events (like form submissions, payment confirmations, etc.).'
      },
      {
        question: 'How do I monitor API-triggered executions?',
        answer: 'Use the execution ID returned by the API trigger to poll the status endpoint. Get real-time updates on execution progress, logs, and results.'
      },
      {
        question: 'Are API triggers secure?',
        answer: 'Yes! API triggers require authentication via API keys. You can generate, manage, and revoke API keys as needed. All API calls are logged for security monitoring.'
      }
    ]
  },
  {
    key: 'file-browser-automation',
    icon: 'file-browser-automation',
    title: 'File Processing & Browser Automation',
    items: [
      {
        question: 'Can I process files in my automations?',
        answer: 'Yes! Upload files through the web interface and access them in your automations via environment variables. The system supports various formats including CSV, Excel, PDF, images, and more.'
      },
      {
        question: 'How do file uploads work?',
        answer: 'Files are uploaded to secure cloud storage and automatically downloaded to your automation\'s execution environment. Access them using environment variable names that contain the local file paths.'
      },
      {
        question: 'Can I automate browser tasks?',
        answer: 'Yes! Turbotic supports browser automation using Puppeteer. The system provides built-in helpers for screenshots, HTML analysis, and AI-powered selector finding. Perfect for replacing traditional RPA tools.'
      },
      {
        question: 'What browser automation features are available?',
        answer: 'Built-in functions include:\n• publishScreenshot() - Share visual progress\n• simplifyHtml() - Clean HTML for analysis\n• findSelectorsUsingAI() - AI-powered element selection\n• Visual progress tracking with screenshots'
      },
      {
        question: 'How do I handle file outputs?',
        answer: 'Save output files in the same directory as your script. The system automatically detects and uploads them as artifacts for user access. Don\'t use absolute paths or different directories.'
      }
    ]
  },
  {
    key: 'monitoring-notifications',
    icon: 'monitoring-notifications',
    title: 'Monitoring & Notifications',
    items: [
      {
        question: 'How do I get notified about automation status?',
        answer: 'The system automatically sends email notifications when scheduled automations complete or fail. Notifications include execution details, logs, and user-friendly summaries.'
      },
      {
        question: 'What information do notifications include?',
        answer: 'Notifications show automation name, execution status, duration, trigger time, and key log information. Failed executions include error details and suggested fixes.'
      },
      {
        question: 'Can I track automation performance?',
        answer: 'Yes! View real-time metrics including run counts, success rates, error rates, execution times, and schedule information. View detailed execution history and statistics.'
      },
      {
        question: 'Are there real-time execution logs?',
        answer: 'Yes! View live execution logs as automations run. The system provides detailed logging with timestamps, error tracking, and output capture for debugging.'
      }
    ]
  },
  {
    key: 'admin-security',
    icon: 'admin-security',
    title: ' Security',
    items: [
      {
        question: 'What security measures are in place?',
        answer: 'The platform includes:\n• OAuth 2.0 authentication\n• API key management\n• Email validation and restrictions\n• Secure file storage\n• Audit logging\n• CSRF protection\n• Pre-installation code analysis'
      },
      {
        question: 'How are my environment variables protected?',
        answer: 'Environment variables are encrypted at rest and only accessible within your automation executions. They are never exposed in logs, shared automations, or marketplace listings. Only you and users you explicitly share with can access your environment variables, and they must configure their own values.'
      },
      {
        question: 'Is my automation code and data secure?',
        answer: 'Yes. All automation code, execution data, and file uploads are stored securely with encryption. Your automations are private by default and only accessible to you unless you explicitly choose to share them. All API communications use HTTPS encryption.'
      },
      {
        question: 'How are API keys managed and secured?',
        answer: 'Each automation has its own unique API key that you can generate, regenerate, or revoke at any time. All API requests require valid authentication and are logged for security monitoring.'
      },
      {
        question: 'What happens to my data when an automation runs?',
        answer: 'Automation executions run in isolated environments. Data is processed securely and temporary execution data is automatically cleaned up after completion. Your persistent data (code, environment variables, files) remains in your secure workspace and is never shared unless you explicitly choose to.'
      }
    ]
  },
  {
    key: 'reliability',
    icon: 'reliability',
    title: 'Reliability & Control',
    items: [
      {
        question: 'How do I know my automation ran successfully?',
        answer: 'View live runs, success/failure stats, and logs for each automation.'
      },
      {
        question: 'What if something fails?',
        answer: 'Turbotic explains the error and suggests fixes. You can chat with the AI to debug step by step.'
      },
      {
        question: 'Can I track performance?',
        answer: 'Yes. See run counts, error rates, schedules, and saved time.'
      },
      {
        question: 'Who controls the data?',
        answer: 'You do. Turbotic uses secure connections to your tools and respects your authentication and permissions.'
      }
    ]
  },
  {
    key: 'user-interface',
    icon: 'user-interface',
    title: 'User Interface & Preferences',
    items: [
      {
        question: 'Can I switch between light and dark mode?',
        answer: 'Yes! Use the theme toggle button (sun/moon icon) in the interface to switch between light and dark modes. Your preference is saved and persists across sessions. The theme also respects your system preference by default.'
      },
      {
        question: 'Does the theme sync across devices?',
        answer: 'The theme preference is stored in your browser\'s localStorage, so it\'s specific to each device/browser. Switch themes anytime and it will remember your choice for that browser.'
      }
    ]
  },
  {
    key: 'value',
    icon: 'value',
    title: 'Value & Differentiation',
    items: [
      {
        question: 'What makes Turbotic different from other automation platforms?',
        answer: 'Unlike traditional automation tools that require coding or complex setup, Turbotic combines AI-powered automation with enterprise-ready features:\n• Natural language automation: describe what you want in plain English and our AI builds it for you\n• No-code for everyone, code editor for developers: works seamlessly for both technical and non-technical users\n• Seamless execution without hassle: run automations instantly with one click, schedule them easily, or trigger via API - no infrastructure setup or configuration needed\n• Built-in browser automation: replace expensive RPA tools with AI-powered browser tasks and visual progress tracking\n• True collaboration: share automations with your team and work together on improvements\n• Enterprise integrations: pre-configured Microsoft 365, unlimited API connections, and webhook support\n• Live debugging: see real-time execution logs, get AI-suggested fixes, and rollback to any previous version instantly'
      },
      {
        question: 'Why should my team use Turbotic?',
        answer: 'Because it saves time, reduces manual work, and empowers everyone — not just IT — to build smart automations. Teams can collaborate by sharing automations and get real-time notifications about automation status.'
      },
      {
        question: 'Is it fun to use?',
        answer: 'Yes! Think of it as having a helpful teammate who never gets tired. You type, it automates.'
      }
    ]
  },
  {
    key: 'support-contact',
    icon: 'support-contact',
    title: 'Support & Contact',
    items: [
      {
        question: 'Need additional help or have questions not covered here?',
        answer: 'We\'re here to help! You can reach out to us through:\n\n• Discord Help Channel: Join our community Discord server for real-time support and discussions with other users\n• Email Support: Send your questions to support@turbotic.com for direct assistance\n\nOur support team typically responds within 24 hours during business days.'
      },
      {
        question: 'How do I join the Discord community?',
        answer: 'Click the Discord link below to join our help channel where you can:\n• Get real-time support from our team and community\n• Share automation ideas and solutions\n• Connect with other Turbotic users\n• Stay updated on new features and announcements'
      },
      {
        question: 'What should I include when contacting support?',
        answer: 'To help us assist you better, please include:\n• A clear description of your question or issue\n• Steps you\'ve already tried\n• Screenshots or error messages (if applicable)\n• Your automation name or ID (if relevant)\n• Any relevant log information'
      }
    ]
  }
];

const FaqPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const { theme } = useTheme();


  // Scroll to section when clicked
  const scrollToSection = (key: string) => {
    setActiveKeys([key]);
    // Small delay to ensure collapse animation completes
    setTimeout(() => {
      const element = document.getElementById(`faq-section-${key}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Enhanced filtering with better search matching
  const filteredFaqData = faqData.map(section => {
    const filteredItems = section.items.filter(item => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      
      // Search in question and answer
      const questionMatch = item.question.toLowerCase().includes(query);
      const answerMatch = item.answer.toLowerCase().includes(query);
      
      // Also search for individual words
      const queryWords = query.split(' ').filter(word => word.length > 2);
      const wordMatch = queryWords.some(word => 
        item.question.toLowerCase().includes(word) || 
        item.answer.toLowerCase().includes(word)
      );
      
      return questionMatch || answerMatch || wordMatch;
    });
    
    return {
      ...section,
      items: filteredItems
    };
  }).filter(section => section.items.length > 0);

  // Function to highlight search terms in text
  const highlightText = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;
    
    const query = searchQuery.toLowerCase().trim();
    const words = query.split(' ').filter(word => word.length > 2);
    const allTerms = [query, ...words];
    
    let highlightedText = text;
    
    allTerms.forEach(term => {
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    
    return highlightedText;
  };

  const formatAnswer = (answer: string, shouldHighlight: boolean = false) => {
    // For bullet points, we need to handle them differently
    if (answer.includes('•')) {
      const lines = answer.split('\n');
      return (
        <>
          {lines.map((line, index) => {
            if (line.trim().startsWith('•')) {
              return (
                <span key={index} className="faq-bullet-point">
                  {shouldHighlight ? (
                    <span dangerouslySetInnerHTML={{ __html: highlightText(line, searchQuery) }} />
                  ) : (
                    line
                  )}
                  <br />
                </span>
              );
            } else if (line.trim()) {
              return (
                <span key={index} className="faq-text-line">
                  {shouldHighlight ? (
                    <span dangerouslySetInnerHTML={{ __html: highlightText(line, searchQuery) }} />
                  ) : (
                    line
                  )}
                  <br />
                </span>
              );
            }
            return null;
          })}
        </>
      );
    }
    
    // Regular text answer
    if (shouldHighlight) {
      return <span dangerouslySetInnerHTML={{ __html: highlightText(answer, searchQuery) }} />;
    }
    return answer;
  };

  return (
    <div
      className="container-background-color faq-container"
      style={{ borderStartStartRadius: 16 }}
    >
      <div className="text-color page-header flex justify-between items-center">
        <span>Frequently Asked Questions</span>
      </div>
      
      <div className="responsive-px-40 faq-content-wrapper overflow-auto">
        <div className="flex gap-8 items-start">
          <div className="flex-1 max-w-4xl">
          <div className="text-[16px] secondary-text mb-4">
            Get answers to common questions about Turbotic Automation AI.
          </div>

          {/* Search Section */}
          <div className="card-background-color p-4 rounded-lg mb-6">
            <SearchInput
              placeholder="Search through all questions and answers..."
              value={searchQuery}
              onChange={(value) => setSearchQuery(value)}
              className="search-input-main"
            />
            {searchQuery && (
              <div className="mt-2 text-sm text-gray-500">
                Found {filteredFaqData.reduce((total, section) => total + section.items.length, 0)} result(s)
              </div>
            )}
          </div>

          <div className="mb-6">

            {/* Popular Questions Section */}
            {!searchQuery && (
              <div className="card-background-color p-6 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-color mb-4">
                  Popular Questions
                </h3>
                <div className="space-y-3">
                  {popularQuestions.map(({ section, index }) => {
                    const sectionData = faqData.find(s => s.key === section);
                    const question = sectionData?.items[index];
                    if (!question) return null;

                    return (
                      <button
                        key={`${section}-${index}`}
                        onClick={() => scrollToSection(section)}
                        className="w-full text-left p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                      >
                        <div className="text-sm font-medium text-color mb-1">{question.question}</div>
                        <div className="text-xs secondary-text line-clamp-2">{question.answer.split('\n')[0]}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          
          {filteredFaqData.length === 0 ? (
            <div className="card-background-color rounded-lg p-12 text-center">
              <div className="mb-4">
                <SearchOutlined className="text-6xl text-gray-400" />
              </div>
              <div className="text-[20px] text-color font-semibold mb-2">No results found for "{searchQuery}"</div>
              <div className="secondary-text mb-6">
                Try searching with different keywords or browse our sections below
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {faqData.slice(0, 6).map((section) => (
                  <button
                    key={section.key}
                    onClick={() => {
                      setSearchQuery('');
                      scrollToSection(section.key);
                    }}
                    className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Collapse
              className="faq-collapse"
              bordered={false}
              expandIconPosition="end"
              activeKey={searchQuery ? filteredFaqData.map(section => section.key) : activeKeys}
              onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
              items={filteredFaqData.map((section) => ({
                key: section.key,
                id: `faq-section-${section.key}`,
                label: (
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3">
                      <span className="text-[18px] font-semibold text-color">
                        {section.title}
                      </span>
                    </div>
                    <Badge
                      count={section.items.length}
                      style={{ backgroundColor: '#1677ff' }}
                      showZero
                    />
                  </div>
                ),
                className: "faq-section",
                children: (
                  <div className="space-y-4">
                    {section.items.map((item, index) => (
                      <div key={index} className="faq-item">
                        <div className="faq-question font-semibold text-[16px] text-color">
                          Q: {searchQuery ? (
                            <span dangerouslySetInnerHTML={{ __html: highlightText(item.question, searchQuery) }} />
                          ) : (
                            item.question
                          )}
                        </div>
                        <div className="faq-answer text-[16px] secondary-text">
                          <span className="faq-answer-label font-semibold text-color">A:</span>
                          <span className="faq-answer-inline">{formatAnswer(item.answer, !!searchQuery)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }))}
            />
          )}
          </div>
          
          {/* Right Sidebar */}
          <div className="w-80 flex-shrink-0 faq-sidebar">
            {/* Spacer to align with description text + margin */}
            <div style={{ height: '64px' }}></div>

            <div className="sticky top-0 space-y-6">
              {/* Help Section */}
              <div className="card-background-color rounded-lg p-6">
                <h3 className="text-lg font-semibold text-color mb-4">
                  Need Help?
                </h3>
                <div className="space-y-4 text-left">
                  <div className="text-sm secondary-text">
                    Can't find what you're looking for? Our support team is here to help!
                  </div>
                  <div className="space-y-2">
                    <a
                      href="https://discord.gg/Uyn2G7S9PT"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 w-full text-left py-3 px-4 text-sm font-medium rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-[#5865F2] hover:bg-[#4752C4] text-white'
                          : 'bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-gray-200 border border-[#5865F2]/30'
                      }`}
                    >
                      <SiDiscord className="w-5 h-5" style={{ color: '#5865F2' }} />
                      Discord Help Channel
                    </a>
                    <a
                      href="mailto:hackathon@turbotic.com"
                      className={`flex items-center gap-2 w-full text-left py-3 px-4 text-sm font-medium rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                          : 'bg-gray-700/40 hover:bg-gray-700/60 text-gray-200 border border-gray-600/40'
                      }`}
                    >
                      <HiMail className="w-5 h-5" style={{ color: theme === 'light' ? '#1a1a1a' : '#D1D5DB' }} />
                      Email Support
                    </a>
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    We typically respond within 24 hours
                  </div>
                </div>
              </div>

              {/* Community */}
              <div className="card-background-color rounded-lg p-6">
                <h3 className="text-lg font-semibold text-color mb-4">
                  Community
                </h3>
                <div className="space-y-4 text-left">
                  <div className="text-sm secondary-text">
                    Join our community to connect with other users, share ideas, and stay updated on the latest features!
                  </div>
                  <div className="space-y-2">
                    <a
                      href="https://discord.gg/tneGYfNBDx"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 w-full text-left py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-[#5865F2] hover:bg-[#4752C4] text-white'
                          : 'bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-gray-200 border border-[#5865F2]/30'
                      }`}
                    >
                      <SiDiscord className="w-5 h-5" style={{ color: '#5865F2' }} />
                      Join Discord
                    </a>
                    <a
                      href="https://www.linkedin.com/company/turbotic/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 w-full text-left py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                        theme === 'light'
                          ? 'bg-[#0A66C2] hover:bg-[#004182] text-white'
                          : 'bg-[#0A66C2]/20 hover:bg-[#0A66C2]/30 text-gray-200 border border-[#0A66C2]/30'
                      }`}
                    >
                      <SiLinkedin className="w-5 h-5" style={{ color: '#0A66C2' }} />
                      LinkedIn
                    </a>
                    {/* Reddit link temporarily removed - will re-add later
                    <a 
                      href="https://www.reddit.com/r/TurboticAutomationAI/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 w-full text-left py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-md transition-colors"
                    >
                      <SiReddit className="w-5 h-5" style={{ color: '#FF4500' }} />
                      Reddit
                    </a>
                    */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaqPage;