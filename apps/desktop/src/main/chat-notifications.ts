/** Keep desktop completion notifications generic so private chat text never leaves the app window. */
export function shouldNotifyChatCompletion(enabled: unknown, windowFocused: boolean): boolean {
  return enabled === true && !windowFocused;
}

export const CHAT_COMPLETION_NOTIFICATION = {
  title: 'Lastbrowser',
  body: 'Eine Antwort ist fertig.'
} as const;
