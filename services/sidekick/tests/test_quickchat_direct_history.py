from runtime.quickchat_direct import _select_quickchat_history


def test_select_quickchat_history_caps_multi_turn_messages():
    history = []
    for index in range(8):
        history.append({"role": "user", "content": f"question {index}"})
        history.append({"role": "assistant", "content": f"answer {index}" * 40})
    selected = _select_quickchat_history(history, "Follow up?")
    assert len(selected) <= 4
    assert selected[-1]["content"].startswith("question 7") or selected[-1]["content"].startswith("answer")


def test_select_quickchat_history_drops_pending_duplicate_user_turn():
    history = [{"role": "user", "content": "Same prompt"}, {"role": "assistant", "content": "Earlier answer"}]
    selected = _select_quickchat_history(history, "Same prompt")
    assert selected == [{"role": "assistant", "content": "Earlier answer"}]
