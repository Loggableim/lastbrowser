import json
import io
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from urllib.parse import urlparse
from unittest.mock import MagicMock, patch

from tools.approval import (
    check_all_command_guards,
    detect_dangerous_command,
    register_gateway_notify,
    requires_explicit_destructive_approval,
    requires_non_bypassable_guard,
    reset_current_session_key,
    resolve_gateway_approval,
    set_current_session_key,
    unregister_gateway_notify,
    command_approval_choices,
    prompt_dangerous_approval,
)


class TerminalDangerousCommandTests(unittest.TestCase):
    def test_powershell_remove_item_aliases_require_explicit_approval(self):
        for alias in ('ri', 'del', 'erase', 'rd', 'rmdir', 'rm'):
            for flag in ('-R', '-Re', '-Rec', '-Recur', '-Recurs', '-Recurse'):
                command = f'{alias} {flag} project'
                with self.subTest(command=command):
                    self.assertTrue(detect_dangerous_command(command)[0])
                    self.assertTrue(requires_explicit_destructive_approval(command))

    def test_smart_approval_requires_an_exact_verdict(self):
        from tools.approval import _smart_approve

        for answer, expected in [("APPROVE", "approve"), ("DENY", "deny"),
                                 ("DISAPPROVE", "escalate"), ("DO NOT APPROVE", "escalate")]:
            response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=answer))])
            with self.subTest(answer=answer), patch("runtime.auxiliary_client.call_llm", return_value=response):
                self.assertEqual(_smart_approve("sample command", "test"), expected)

    def test_destructive_commands_are_detected(self):
        for command in [
            "rm project -rf",
            "rm project --recursive",
            "rm 'project files' -r",
            "rm one two -rf",
            r"del /s C:\work\old-files\*",
            r"rmdir /s /q C:\work\old-files",
            r"rd /q /s C:\work\old-files",
            r"Remove-Item -Recurse C:\work\old-files",
            r"format D:",
            r"taskkill /PID 1234",
            r"Stop-Process -Id 1234 -Force",
            r"Stop-Process -Name example",
            r"kill 1234",
            r"rm --force --recursive project",
            r"rm -f --recursive project",
            r"rm -f -r project",
            r"rm --force -r project",
            r"git -C project reset --hard",
            r"git reset --quiet --hard",
            r"git reset HEAD --hard",
            r"git -C project reset HEAD --hard",
            r"git -C project push --force origin main",
            r"git -C project clean -fd",
            r"git --git-dir=repo.git reset --hard",
            r"git --git-dir repo.git --work-tree project clean -fd",
            r"git --work-tree='my project' push --force origin main",
            r"git push origin +main:main",
            r"git -C project push origin '+main:main'",
            r"git clean --force -d",
            r"git clean -d -f",
            r"git clean -d --force",
            r"git clean project -fd",
            r"git -C project clean path --force",
            r"DELETE FROM users; SELECT * FROM audit WHERE id = 1",
            "DELETE QUICK FROM users",
            "DELETE LOW_PRIORITY IGNORE FROM users",
            "DELETE QUICK users FROM users JOIN audit ON users.id = audit.id",
            "DELETE QUICK users, audit FROM users JOIN audit ON users.id = audit.id",
            "DELETE QUICK `users`.* FROM users JOIN audit ON users.id = audit.id",
            "DELETE /* comment */ QUICK FROM users USING (SELECT id FROM audit WHERE active = 1) AS a",
            "DELETE /* cleanup */ FROM users",
            "DELETE -- cleanup\nFROM users",
            "DELETE FROM users -- WHERE id = 1",
            "DELETE FROM users /* WHERE id = 1 */",
            "DELETE FROM users /* WHERE id = 1; */",
            "DELETE FROM users RETURNING 'WHERE'",
            'DELETE FROM "WHERE"',
            'DELETE FROM `where`',
            'DELETE FROM users # WHERE id = 1',
            'mysql -e "DELETE FROM users" && echo WHERE',
            "mysql -e 'DELETE FROM users' | cat WHERE",
            'DELETE FROM users USING (SELECT id FROM audit WHERE active = 1) AS a',
            'DELETE FROM users RETURNING (SELECT count(*) FROM audit WHERE active = 1)',
            r"Remove-Item C:\Windows\System32\example.dll",
        ]:
            with self.subTest(command=command):
                self.assertTrue(detect_dangerous_command(command)[0])
                self.assertTrue(requires_explicit_destructive_approval(command))

    def test_read_only_commands_are_not_flagged(self):
        for command in ["git status", "git --git-dir=repo.git --work-tree='my project' status", "git push origin main:main", "Get-ChildItem C:\\work", "echo format report", "rm -f project", "rm -- -r", "rm project -- -rf", r"rd /q C:\work\empty", "DELETE FROM users WHERE id = 1", "DELETE QUICK FROM users WHERE id = 1", "DELETE LOW_PRIORITY IGNORE users FROM users JOIN audit ON users.id = audit.id WHERE users.id = 1", "DELETE /* cleanup */ FROM users WHERE id = 1", 'sqlite3 test.db "DELETE FROM users WHERE id = 1"', 'DELETE FROM `where` WHERE id = 1', 'DELETE FROM users WHERE value = "a&&b"', 'DELETE FROM users WHERE id IN (SELECT id FROM audit WHERE active = 1)']:
            with self.subTest(command=command):
                self.assertFalse(detect_dangerous_command(command)[0])

    def test_destructive_commands_are_not_autoapproved_without_a_user(self):
        with patch.dict("os.environ", {"SIDEKICK_YOLO_MODE": "1"}, clear=True):
            with patch("tools.approval._get_approval_mode", return_value="off"):
                for command in ("rm -rf project", "rm project -rf", "rm project --recursive", "rm -f -r project", "ri -Recurse project", r"rd /s /q C:\work\old-files", "Stop-Process -Id 1234", "DELETE /* cleanup */ FROM users", "DELETE QUICK FROM users", "DELETE QUICK users FROM users JOIN audit ON users.id = audit.id", "git clean -d -f", "git clean project -fd", "git reset --quiet --hard", "git reset HEAD --hard"):
                    with self.subTest(command=command):
                        result = check_all_command_guards(command, "local")
                        self.assertFalse(result["approved"])

    def test_sql_where_in_shell_suffix_and_comments_does_not_bypass_forced_guard(self):
        for command in ('DELETE FROM `where`', 'DELETE FROM users # WHERE id = 1',
                        'mysql -e "DELETE FROM users" && echo WHERE'):
            with self.subTest(command=command), patch.dict('os.environ', {'SIDEKICK_YOLO_MODE': '1'}, clear=True):
                with patch('tools.approval._get_approval_mode', return_value='off'):
                    self.assertTrue(requires_non_bypassable_guard(command))
                    self.assertFalse(check_all_command_guards(command, 'local')['approved'])

    def test_rm_filename_containing_flag_text_is_not_a_recursive_option(self):
        self.assertFalse(detect_dangerous_command("rm 'project -rf'")[0])

    def test_git_reset_options_end_at_double_dash(self):
        self.assertFalse(requires_explicit_destructive_approval("git reset HEAD -- --hard"))

    def test_git_clean_options_end_at_double_dash(self):
        self.assertFalse(requires_explicit_destructive_approval("git clean project -- -fd"))
        self.assertFalse(requires_explicit_destructive_approval("git clean -- -fd"))

    def test_each_destructive_command_requires_a_fresh_interactive_decision(self):
        with patch.dict("os.environ", {"SIDEKICK_INTERACTIVE": "1", "SIDEKICK_YOLO_MODE": "1"}):
            with patch("tools.approval._get_approval_mode", return_value="off"):
                with patch("tools.tirith_security.check_command_security", return_value={"action": "allow", "findings": []}):
                    with patch("tools.approval.prompt_dangerous_approval", side_effect=["session", "deny"]) as prompt:
                        first = check_all_command_guards("rm -rf project", "local")
                        second = check_all_command_guards("rm -rf project", "local")
        self.assertTrue(first["approved"])
        self.assertFalse(second["approved"])
        self.assertEqual(prompt.call_count, 2)

    def test_container_commands_require_approval_too(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(check_all_command_guards("rm -rf project", "docker")["approved"])

    def test_destructive_action_after_another_warning_still_needs_fresh_approval(self):
        command = "python -c 'print(1)' && git reset --hard"
        self.assertTrue(requires_explicit_destructive_approval(command))
        self.assertTrue(requires_explicit_destructive_approval("rm -f --recursive project"))
        self.assertTrue(requires_explicit_destructive_approval("git reset --quiet --hard"))
        self.assertTrue(requires_explicit_destructive_approval("git clean --force -d"))
        self.assertTrue(requires_explicit_destructive_approval("git clean -d -f"))
        self.assertTrue(requires_explicit_destructive_approval("git clean -d --force"))

    def test_invalid_interactive_decision_is_denied(self):
        with patch.dict("os.environ", {"SIDEKICK_INTERACTIVE": "1"}):
            with patch("tools.approval._get_approval_mode", return_value="manual"):
                with patch("tools.tirith_security.check_command_security", return_value={"action": "allow", "findings": []}):
                    with patch("tools.approval.prompt_dangerous_approval", return_value=None):
                        result = check_all_command_guards("rm -rf project", "local")
        self.assertFalse(result["approved"])

    def test_missing_interactive_handler_does_not_create_unusable_approval(self):
        with patch.dict("os.environ", {"SIDEKICK_EXEC_ASK": "1"}):
            with patch("tools.approval._get_approval_mode", return_value="manual"):
                with patch("tools.approval._is_gateway_approval_context", return_value=False):
                    with patch("tools.tirith_security.check_command_security", return_value={"action": "allow", "findings": []}):
                        result = check_all_command_guards("rm -rf project", "local")
        self.assertFalse(result["approved"])
        self.assertNotEqual(result.get("status"), "approval_required")

    def test_gateway_approval_is_bound_to_each_displayed_command(self):
        session = "terminal-approval-test"
        token = set_current_session_key(session)
        seen = []

        def approve(data):
            seen.append((data["command"], data.get("once_only")))
            resolve_gateway_approval(session, "once")

        register_gateway_notify(session, approve)
        try:
            with patch.dict("os.environ", {"SIDEKICK_EXEC_ASK": "1", "SIDEKICK_YOLO_MODE": "1"}):
                with patch("tools.approval._get_approval_mode", return_value="off"):
                    with patch("tools.tirith_security.check_command_security", return_value={"action": "allow", "findings": []}):
                        first = check_all_command_guards("rm -rf project", "local")
                        second = check_all_command_guards("rm -rf other", "local")
            self.assertTrue(first["approved"])
            self.assertTrue(second["approved"])
            self.assertEqual(seen, [("rm -rf project", True), ("rm -rf other", True)])
        finally:
            unregister_gateway_notify(session)
            reset_current_session_key(token)

    def test_terminal_force_does_not_bypass_destructive_guard(self):
        from tools import terminal_tool

        environment = MagicMock()
        config = {"env_type": "local", "cwd": ".", "timeout": 10}
        with patch.dict("os.environ", {"SIDEKICK_YOLO_MODE": "1"}, clear=True):
            with patch.object(terminal_tool, "_get_env_config", return_value=config):
                with patch.object(terminal_tool, "_resolve_container_task_id", return_value="guard-test"):
                    with patch.object(terminal_tool, "_start_cleanup_thread"):
                        with patch.dict(terminal_tool._active_environments, {"guard-test": environment}):
                            for command in ("rm -rf project", "DELETE QUICK FROM users", 'DELETE FROM `where`',
                                            'DELETE FROM users # WHERE id = 1', 'mysql -e "DELETE FROM users" && echo WHERE'):
                                result = json.loads(terminal_tool.terminal_tool(command, force=True))
                                self.assertEqual(result["status"], "blocked")
        environment.execute.assert_not_called()

    def test_terminal_force_cannot_bypass_unconditional_guards(self):
        from tools import terminal_tool

        environment = MagicMock()
        environment.execute.return_value = {"output": "simulated", "returncode": 0}
        config = {"env_type": "local", "cwd": ".", "timeout": 10}
        with patch.dict("os.environ", {"SIDEKICK_YOLO_MODE": "1"}, clear=True):
            with patch.object(terminal_tool, "_get_env_config", return_value=config):
                with patch.object(terminal_tool, "_resolve_container_task_id", return_value="guard-test"):
                    with patch.object(terminal_tool, "_start_cleanup_thread"):
                        with patch.dict(terminal_tool._active_environments, {"guard-test": environment}):
                            for command in ("shutdown", "sudo -S whoami"):
                                with self.subTest(command=command):
                                    result = json.loads(terminal_tool.terminal_tool(command, force=True))
                                    self.assertEqual(result["status"], "blocked")
                                    environment.execute.assert_not_called()

    def test_terminal_executes_only_after_exact_gateway_approval(self):
        from tools import terminal_tool

        session = "terminal-full-path-test"
        token = set_current_session_key(session)
        environment = MagicMock()
        environment.execute.return_value = {"output": "simulated", "returncode": 0}
        config = {"env_type": "local", "cwd": ".", "timeout": 10}
        displayed = []

        def approve(data):
            environment.execute.assert_not_called()
            displayed.append(data["command"])
            resolve_gateway_approval(session, "once", approval_id=data["approval_id"])

        register_gateway_notify(session, approve)
        try:
            with patch.dict("os.environ", {"SIDEKICK_EXEC_ASK": "1", "SIDEKICK_YOLO_MODE": "1"}):
                with patch.object(terminal_tool, "_get_env_config", return_value=config):
                    with patch.object(terminal_tool, "_resolve_container_task_id", return_value="guard-test"):
                        with patch.object(terminal_tool, "_start_cleanup_thread"):
                            with patch.dict(terminal_tool._active_environments, {"guard-test": environment}):
                                with patch("tools.approval._get_approval_mode", return_value="off"):
                                    with patch("tools.tirith_security.check_command_security", return_value={"action": "allow", "findings": []}):
                                        result = json.loads(terminal_tool.terminal_tool("rm -rf project", force=True))
            self.assertEqual(displayed, ["rm -rf project"])
            self.assertEqual(result["exit_code"], 0)
            environment.execute.assert_called_once_with("rm -rf project", timeout=10, cwd=".")
        finally:
            unregister_gateway_notify(session)
            reset_current_session_key(token)

    def test_native_bridge_resolves_only_the_chosen_pending_command(self):
        from runtime.independent.native_chat_worker import ExactPendingBridge
        from tools import approval

        session = "native-terminal-approval-test"
        first = approval._ApprovalEntry({"command": "rm -rf one", "once_only": True})
        second = approval._ApprovalEntry({"command": "rm -rf two", "once_only": True})
        bridge = ExactPendingBridge(SimpleNamespace(session_id=session))
        with approval._lock:
            approval._gateway_queues[session] = [first, second]
        try:
            pending = bridge.bind("approval", second.data)
            self.assertTrue(pending["once_only"])
            self.assertTrue(bridge.resolve("approval", pending["requestId"], "once"))
            self.assertTrue(second.event.is_set())
            self.assertEqual(second.result, "once")
            self.assertFalse(first.event.is_set())
            self.assertFalse(bridge.resolve("approval", pending["requestId"], "once"))
        finally:
            unregister_gateway_notify(session)

    def test_gateway_response_with_id_cannot_resolve_a_different_command(self):
        from tools import approval

        session = "web-terminal-approval-test"
        first = approval._ApprovalEntry({"command": "rm -rf one", "approval_id": "one"})
        second = approval._ApprovalEntry({"command": "rm -rf two", "approval_id": "two"})
        with approval._lock:
            approval._gateway_queues[session] = [first, second]
        try:
            self.assertEqual(resolve_gateway_approval(session, "once", approval_id="missing"), 0)
            self.assertFalse(first.event.is_set())
            self.assertFalse(second.event.is_set())
            self.assertEqual(resolve_gateway_approval(session, "once", approval_id="two"), 1)
            self.assertTrue(second.event.is_set())
            self.assertFalse(first.event.is_set())
        finally:
            unregister_gateway_notify(session)

    def test_bulk_autoapproval_preserves_one_time_only_requests(self):
        from tools import approval

        session = "bulk-terminal-approval-test"
        mandatory = approval._ApprovalEntry({"command": "rm -rf project", "once_only": True})
        ordinary = approval._ApprovalEntry({"command": "chmod 777 report"})
        with approval._lock:
            approval._gateway_queues[session] = [mandatory, ordinary]
        try:
            self.assertEqual(resolve_gateway_approval(session, "once", resolve_all=True), 1)
            self.assertFalse(mandatory.event.is_set())
            self.assertTrue(ordinary.event.is_set())
            self.assertEqual(resolve_gateway_approval(session, "deny", resolve_all=True), 1)
            self.assertTrue(mandatory.event.is_set())
            self.assertEqual(mandatory.result, "deny")
        finally:
            unregister_gateway_notify(session)

    def test_web_response_rejects_stale_id_instead_of_approving_another_command(self):
        from tools import approval
        from web.api import routes

        session = "web-stale-approval-test"
        entry = approval._ApprovalEntry({"command": "rm -rf one", "approval_id": "current"})
        with approval._lock:
            approval._gateway_queues[session] = [entry]
        try:
            with patch.object(routes, "_reject_legacy_native_control", return_value=False):
                with patch.object(routes, "j", side_effect=lambda handler, body, **kwargs: (body, kwargs.get("status", 200))):
                    response = routes._handle_approval_respond(None, {"session_id": session, "choice": "once", "approval_id": "stale"})
            self.assertEqual(response[1], 409)
            self.assertFalse(entry.event.is_set())
        finally:
            unregister_gateway_notify(session)

    def test_web_response_without_id_cannot_approve_a_one_time_command(self):
        from tools import approval
        from web.api import routes

        session = "web-no-id-approval-test"
        entry = approval._ApprovalEntry({"command": "rm -rf project", "approval_id": "current", "once_only": True})
        with approval._lock:
            approval._gateway_queues[session] = [entry]
        try:
            with patch.object(routes, "_reject_legacy_native_control", return_value=False):
                with patch.object(routes, "j", side_effect=lambda handler, body, **kwargs: (body, kwargs.get("status", 200))):
                    response = routes._handle_approval_respond(None, {"session_id": session, "choice": "once"})
            self.assertEqual(response[1], 409)
            self.assertFalse(entry.event.is_set())
        finally:
            unregister_gateway_notify(session)

    def test_web_poll_recovers_blocking_gateway_approval(self):
        from tools import approval
        from web.api import routes

        session = "web-approval-recovery-test"
        entry = approval._ApprovalEntry({"command": "rm -rf project", "approval_id": "recover", "once_only": True})
        with approval._lock:
            approval._gateway_queues[session] = [entry]
        try:
            with patch.object(routes, "j", side_effect=lambda handler, body, **kwargs: body):
                result = routes._handle_approval_pending(None, urlparse("/?session_id=" + session))
            self.assertEqual(result["pending"]["approval_id"], "recover")
            self.assertTrue(result["pending"]["once_only"])
        finally:
            unregister_gateway_notify(session)

    def test_web_response_notifies_subscribers_about_remaining_gateway_request(self):
        from tools import approval
        from web.api import routes

        session = "web-approval-next-test"
        first = approval._ApprovalEntry({"command": "rm -rf one", "approval_id": "one", "once_only": True})
        second = approval._ApprovalEntry({"command": "rm -rf two", "approval_id": "two", "once_only": True})
        with approval._lock:
            approval._gateway_queues[session] = [first, second]
        try:
            with patch.object(routes, "_reject_legacy_native_control", return_value=False):
                with patch.object(routes, "_approval_sse_notify_locked") as notify:
                    with patch.object(routes, "j", side_effect=lambda handler, body, **kwargs: body):
                        routes._handle_approval_respond(None, {"session_id": session, "choice": "once", "approval_id": "one"})
            self.assertEqual(notify.call_args.args[1]["approval_id"], "two")
            self.assertEqual(notify.call_args.args[2], 1)
        finally:
            unregister_gateway_notify(session)

    def test_cli_offers_only_once_or_deny_for_destructive_commands(self):
        self.assertEqual(command_approval_choices("rm -rf project"), ["once", "deny"])
        self.assertEqual(command_approval_choices("chmod 777 report"), ["once", "session", "always", "deny"])
        self.assertEqual(command_approval_choices("chmod 777 report", allow_permanent=False), ["once", "session", "deny"])

    def test_basic_cli_rejects_session_choice_for_destructive_command(self):
        output = io.StringIO()
        with patch("prompt_toolkit.application.current.get_app_or_none", return_value=None):
            with patch("runtime.i18n.t", side_effect=lambda key, **kwargs: "Allow once" if key == "approval.once_only" else key):
                with patch("builtins.input", return_value="session"):
                    with redirect_stdout(output):
                        choice = prompt_dangerous_approval("rm -rf project", "recursive delete", timeout_seconds=2)
        self.assertEqual(choice, "deny")
        self.assertIn("Allow once", output.getvalue())

    def test_once_only_prompt_has_german_and_english_translations(self):
        from runtime.i18n import t
        self.assertIn("Einmal", t("approval.once_only", lang="de"))
        self.assertIn("Allow once", t("approval.once_only", lang="en"))
