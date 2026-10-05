"""Conservative AUTO routing with a trusted capability input and no cloud fallback."""
from __future__ import annotations

import re
import unicodedata
from typing import Literal
from pydantic import Field
from runtime.independent.contracts import Contract

TaskClass = Literal['simple', 'complex', 'unclear']
Route = Literal['local', 'selected_provider', 'unavailable']

LOCAL_CHAT_LIMITS = {
    'contextTokens': 1024,
    'maxOutputTokens': 48,
    'parallelRequests': 1,
    'maxRamBytes': 768 * 1024 * 1024,
    'maxSeconds': 25,
}

class AutoRouteRequest(Contract):
    text: str = Field(max_length=16384)

class AutoRouteCapabilities(Contract):
    # These values must be constructed from authenticated host state, never IPC.
    local_chat_ready: bool = False
    selected_provider_ready: bool = False
    selected_provider_id: str | None = None
    cloud_explicitly_selected: bool = False

class AutoRouteDecision(Contract):
    task_class: TaskClass
    route: Route
    provider_id: str | None = None
    reason_code: str
    limits: dict[str, int] | None = None
    cloud_fallback: Literal[False] = False

_COMPLEX = (
    'recherchier', 'recherchiere', 'recherchieren', 'aktuell', 'heute', 'jetzt',
    'vergleiche', 'vergleichen', 'quellen', 'zitiere', 'belege', 'analysiere',
    'analysieren', 'zusammenfassen', 'zusammenfassung', 'mehrstufig', 'schritt für schritt',
    'browser', 'website', 'webseite', 'öffne', 'klicke', 'lade herunter', 'installiere',
    'programmier', 'code', 'debug', 'fehler beheben', 'datei', 'anhang', 'bild', 'video',
    'erstelle einen plan', 'erstelle eine tabelle', 'schreibe einen bericht',
    # Conservative domain escalation: brevity does not establish a safe local
    # capability for medical, legal, financial, or time-sensitive advice.
    'medizin', 'medizinisch', 'diagnose', 'symptom', 'dosier', 'dosis', 'medikament',
    'insulin', 'tablette', 'schmerzmittel', 'arzt', 'therapie', 'schwangerschaft',
    'rechtswirksam', 'rechtlich', 'rechtslage', 'gesetz', 'vertrag', 'kündigung',
    'gericht', 'anwalt', 'steuer', 'finanz', 'investier', 'aktie', 'kredit', 'hypothek',
    'versicherung', 'rente', 'zins', 'wechselkurs', 'preis heute', 'stand heute',
)
_VAGUE = ('mach das', 'mach es', 'tu das', 'hilf mir', 'das bitte', 'wie meinst du', 'was meinst du')

# Local eligibility is positive and intentionally small. These exact, stable
# examples and two-operand arithmetic forms are direct-answer tasks; arbitrary
# short questions, definitions, or translations are never admitted by shape.
_SAFE_TRIVIA = frozenset({
    'was ist die hauptstadt von österreich?',
    'what is the capital of austria?',
    '¿cuál es la capital de austria?',
    'quelle est la capitale de l’autriche?',
    'qual è la capitale dell’austria?',
    'qual é a capital da áustria?',
    'столица австрии — какой город?',
    'オーストリアの首都はどこですか？',
})

_SAFE_TRANSLATIONS = frozenset({
    'translate “good morning” into german.',
    'übersetze “good morning” ins deutsche.',
    'traduce “good morning” al alemán.',
    'traduis “good morning” en allemand.',
    'traduci “good morning” in tedesco.',
    'traduza “good morning” para alemão.',
    'переведи “good morning” на немецкий.',
    '「good morning」をドイツ語に翻訳して。',
})

_ARITHMETIC_SYMBOLS = re.compile(r'^(?:what is )?(\d{1,4})\s*([+*/×÷-])\s*(\d{1,4})\??$')
_ARITHMETIC_WORDS = re.compile(
    r'^(?:(?:what is|wie viel ist)\s+)?(\d{1,4})\s+'
    r'(plus|minus|times|multiplied by|mal|divided by|geteilt durch)\s+(\d{1,4})\??$'
)

def _is_allowlisted_direct_answer(value: str) -> bool:
    if value in _SAFE_TRIVIA or value in _SAFE_TRANSLATIONS:
        return True
    match = _ARITHMETIC_SYMBOLS.fullmatch(value) or _ARITHMETIC_WORDS.fullmatch(value)
    if not match:
        return False
    left = int(match.group(1))
    operator = match.group(2)
    right = int(match.group(3))
    if operator in ('+', 'plus'):
        answer = left + right
    elif operator in ('-', 'minus'):
        answer = left - right
    elif operator in ('*', '×', 'times', 'multiplied by', 'mal'):
        answer = left * right
    elif operator in ('/', '÷', 'divided by', 'geteilt durch'):
        if right == 0 or left % right:
            return False
        answer = left // right
    else:
        return False
    return abs(answer) <= 10000

def classify_task(text: str) -> TaskClass:
    """Allow only a tiny positive set for local routing; unknown stays remote."""
    if not isinstance(text, str):
        return 'unclear'
    value = unicodedata.normalize('NFKC', text).casefold().replace('"', '“')
    value = ' '.join(value.split())
    if not value or len(value) < 5 or any(phrase in value for phrase in _VAGUE):
        return 'unclear'
    if (len(value) > 350 or value.count('?') > 1 or 'http://' in value or 'https://' in value
            or any(marker in value for marker in _COMPLEX)):
        return 'complex'
    if _is_allowlisted_direct_answer(value):
        return 'simple'
    return 'unclear'

def decide_auto_route(request: AutoRouteRequest, capabilities: AutoRouteCapabilities) -> AutoRouteDecision:
    task_class = classify_task(request.text)
    if task_class == 'simple' and capabilities.local_chat_ready:
        return AutoRouteDecision(task_class=task_class, route='local', provider_id='local-ai',
            reason_code='auto_simple_task_local_capability_verified', limits=LOCAL_CHAT_LIMITS)
    if capabilities.selected_provider_ready and capabilities.selected_provider_id:
        reason = ('auto_local_capability_unavailable_preserve_selection' if task_class == 'simple'
            else 'auto_complex_task_preserve_selection' if task_class == 'complex'
            else 'auto_unclear_task_preserve_selection')
        return AutoRouteDecision(task_class=task_class, route='selected_provider',
            provider_id=capabilities.selected_provider_id, reason_code=reason)
    return AutoRouteDecision(task_class=task_class, route='unavailable',
        reason_code='auto_no_verified_route_available')
