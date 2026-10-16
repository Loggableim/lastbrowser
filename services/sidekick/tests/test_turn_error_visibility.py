from web.api.streaming import _turn_failed_without_reply


def test_follow_up_provider_failure_is_not_hidden_by_older_replies():
    history = [
        {"role": "user", "content": "earlier"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "Ungueltiges Modell"},
    ]
    failed = {
        "failed": True,
        "error": "Error code: 404 - {'error': {'message': 'model_not_found: demo-local ist hier nicht gültig'}}",
        "final_response": None,
        "messages": history,
    }
    assert _turn_failed_without_reply(failed)
    assert not _turn_failed_without_reply({"failed": False, "final_response": "hello", "messages": history})
