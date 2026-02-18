/**
 * Microsoft app configurations for different Microsoft services
 * Moved from admin integrations to lib for non-admin access
 */
export const MICROSOFT_APP_CONFIGS = {
  'outlook': {
    scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Mail.Send'],
    envPrefix: 'MICROSOFT'
  },
  'teams': {
    scopes: ['https://graph.microsoft.com/Channel.ReadBasic.All', 'https://graph.microsoft.com/Chat.Read'],
    envPrefix: 'MICROSOFT'
  },
  'calendar': {
    scopes: ['https://graph.microsoft.com/Calendars.Read', 'https://graph.microsoft.com/Calendars.ReadWrite'],
    envPrefix: 'MICROSOFT'
  },
  'sharepoint': {
    scopes: ['https://graph.microsoft.com/Sites.ReadWrite.All'],
    envPrefix: 'MICROSOFT'
  }
} as const;

