export type MailAccount = {
  id: string; email: string; provider: 'gmail' | 'imap'; username?: string; has_password?: boolean;
  imap_host?: string; imap_port?: number; imap_security?: string;
  smtp_host?: string; smtp_port?: number; smtp_security?: string;
};
export type MailConfig = { enabled: boolean; accounts: Record<string, MailAccount> };
export async function mailRequest(workspace: string, path: string, body?: Record<string, unknown>, query: Record<string, string | number> = {}) {
  if (!workspace.trim()) throw new Error('Bitte einen Space auswählen.');
  const payload = await window.lastbrowser.sidekick.requestWebui({
    method: body ? 'POST' : 'GET', path: `/api/mail/${path}`,
    query: body ? undefined : { ...query, workspace }, body: body ? { ...body, workspace } : undefined
  });
  if (payload.error) throw new Error(typeof payload.error === 'string' ? payload.error : (payload.error as { message?: string }).message || 'Mail-Anfrage fehlgeschlagen.');
  return payload;
}
