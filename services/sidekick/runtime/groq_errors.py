"""Safe, actionable Groq errors for the direct Quickchat path."""


def quickchat_groq_error(provider, error, session_id):
    if str(provider or '').strip().lower() != 'groq':
        return None
    status = getattr(error, 'status_code', None)
    if status == 401:
        return {'code': 'groq_key_invalid', 'error': 'The Groq API key is invalid. Check it in settings.', 'session_id': session_id}
    if status == 429:
        return {'code': 'groq_rate_limited', 'error': 'Groq reports a usage or rate limit. Check your quota and try again later.', 'session_id': session_id}
    return None
