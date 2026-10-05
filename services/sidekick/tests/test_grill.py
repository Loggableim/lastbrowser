"""Actual scoped handlers/store leases and strict durable clarification state."""
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.contracts import Scope
from runtime.independent.grill import (Answer, GrillConflict, GrillState, answer_question,
    change_status, load_state, parse_question_output, propose_question, state_view)
from runtime.independent.scope import ScopeError
from runtime.independent.store import ResourceBusy
from web.api.grill import command_grill, complete_grill_output, publish_grill_question, read_grill


@pytest.fixture
def chat(tmp_path):
    from runtime.independent.scope_binding import ProfileHub
    home, state, workspace = (tmp_path / x for x in ("home", "state", "workspace"))
    home.mkdir(); state.mkdir(); workspace.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path":str(workspace),"name":"workspace"}]), "utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scope = Scope.model_validate(hub.bind("default", {"workspacePath":str(workspace),
        "browserProfileId":"browser", "partitionKey":"persist:grill"})["scope"])
    path = tmp_path / "session.json"
    session = SimpleNamespace(session_id="grill-chat", profile="default", workspace=str(workspace),
        space_scope=scope.model_dump(mode="json", by_alias=True), independent=None,
        chat_execution_mode={"schemaVersion":1,"mode":"grill_me","lifetime":"chat","revision":2},
        grill_state=None)
    def save(**_):
        path.write_text(json.dumps({k:v for k,v in vars(session).items() if k != "save"}), "utf-8")
    session.save = save
    yield hub, scope, session, path
    hub.close()


def body(scope, session, action="start", revision=0, request="request-0001", **fields):
    return {"space_scope":scope.model_dump(mode="json", by_alias=True), "session_id":session.session_id,
        "action":action, "expected_revision":revision,"client_request_id":request, **fields}


def start(chat):
    hub,scope,session,_ = chat
    return command_grill(session, body(scope,session,objective="Design an understandable browser",
        topics=[{"id":"audience","label":"Audience"},{"id":"budget","label":"Budget"}]),
        actor="default",profile_hub=hub)


def question(state, topic="audience"):
    return propose_question(state, {"topicId":topic,"topicLabel":"Audience" if topic == "audience" else "Budget",
        "prompt":"Who uses the browser?","options":["Individuals","Teams","Both"]}, expected_revision=state.revision)


def test_real_handler_restart_answer_correction_review_and_user_finish(chat):
    hub,scope,session,path = chat
    assert start(chat)["grill"]["revision"] == 1
    session.grill_state = question(load_state(session.grill_state)).model_dump(mode="json",by_alias=True)
    session.save()
    loaded = json.loads(path.read_text("utf-8"))
    recovered = SimpleNamespace(**loaded,save=session.save)
    snapshot = read_grill(recovered,scope.model_dump(by_alias=True),actor="default",profile_hub=hub)["grill"]
    assert snapshot["coverage"][1]["status"] == "unresolved"
    q = snapshot["questions"][0]
    answer = body(scope,session,"answer",2,"request-0002",questionId=q["questionId"],
        questionRevision=0,choiceId=q["options"][1]["id"])
    result = command_grill(session,answer,actor="default",profile_hub=hub)
    assert result["grill"]["summary"][0]["answer"] == "Teams"
    review = command_grill(session,body(scope,session,"review",3,"request-0003"),actor="default",profile_hub=hub)
    assert review["grill"]["status"] == "review"
    edited = command_grill(session,body(scope,session,"answer",4,"request-0004",questionId=q["questionId"],
        questionRevision=1,text="A team with accessibility requirements"),actor="default",profile_hub=hub)
    assert edited["grill"]["summary"][0]["answer"] == "A team with accessibility requirements"
    assert edited["grill"]["questions"][0]["revision"] == 2
    finish = command_grill(session,body(scope,session,"finish",5,"request-0005"),actor="default",profile_hub=hub)
    assert finish["grill"]["status"] == "finished"
    assert session.chat_execution_mode["mode"] == "grill_me"
    assert finish["grill"]["coverage"][1]["status"] == "unresolved"
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,"resume",6,"request-0006"),actor="default",profile_hub=hub)


def test_commands_replay_exact_request_and_reject_stale_reuse(chat):
    hub,scope,session,_ = chat
    first = start(chat)
    assert start(chat)["replayed"] is True
    assert session.grill_state["revision"] == first["grill"]["revision"]
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,objective="Different objective"),actor="default",profile_hub=hub)
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,"review",0,"request-0002"),actor="default",profile_hub=hub)


def test_actual_writer_blocks_user_command_and_is_released_after_save_failure(chat):
    hub,scope,session,_ = chat
    store,_ = hub.by_scope(scope,"default")
    lease = store.acquire_chat_writer(scope,session.session_id,"existing-worker","generation")
    try:
        with pytest.raises(ResourceBusy): start(chat)
        assert session.grill_state is None
    finally:
        store.release_lease(lease["leaseId"],owner_generation="generation")
    def fail(**_): raise OSError("private test failure")
    session.save = fail
    with pytest.raises(OSError): start(chat)
    assert session.grill_state is None
    assert not any(l["resourceKey"] == "session_writer:"+session.session_id for l in store.list_leases(active_only=True))


@pytest.mark.parametrize("violation",["scope","session","actor","mode","revision","next_turn"])
def test_foreign_identity_or_mode_cannot_mutate(chat,violation):
    hub,scope,session,_ = chat
    command = body(scope,session,objective="Goal")
    actor = "default"
    if violation == "scope": command["space_scope"]["browserProfileId"] = "foreign"
    elif violation == "session": command["session_id"] = "foreign"
    elif violation == "actor": actor = "foreign"
    elif violation == "mode": session.chat_execution_mode["mode"] = "action"
    elif violation == "revision": command["expected_revision"] = True
    else: session.chat_execution_mode["lifetime"] = "next_turn"
    with pytest.raises((ScopeError,GrillConflict,ValidationError)):
        command_grill(session,command,actor=actor,profile_hub=hub)
    assert session.grill_state is None


def test_skip_resume_and_many_questions_have_no_fixed_finish_rule(chat):
    start(chat)
    state = load_state(chat[2].grill_state)
    for index in range(15):
        state = question(state)
        q = state.questions[-1]
        state = answer_question(state,expected_revision=state.revision,question_id=q.question_id,
            question_revision=q.revision,answer=Answer(kind="skipped" if index == 0 else "text",
                **({} if index == 0 else {"text":f"Answer {index}"})))
        assert state.status == "asking"
    state = change_status(state,"review",expected_revision=state.revision)
    state = change_status(state,"resume",expected_revision=state.revision)
    assert state.status == "asking" and len(state.questions) == 15


@pytest.mark.parametrize("payload",[
    {"topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["one","two"]},
    {"topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["one","ONE","three"]},
    {"topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["one","two","three"],"permissions":["write"]},
])
def test_malformed_question_cannot_become_controls(chat,payload):
    start(chat)
    state = load_state(chat[2].grill_state)
    with pytest.raises(ValidationError): propose_question(state,payload,expected_revision=state.revision)
    assert state.questions == []


def test_wrong_question_option_and_revision_are_rejected(chat):
    start(chat)
    state = question(load_state(chat[2].grill_state))
    q = state.questions[0]
    with pytest.raises(ValidationError):
        answer_question(state,expected_revision=2,question_id=q.question_id,question_revision=0,
            answer=Answer(kind="choice",choiceId="foreign-option"))
    for identity,revision in (("foreign-question",0),(q.question_id,1)):
        with pytest.raises(GrillConflict):
            answer_question(state,expected_revision=2,question_id=identity,question_revision=revision,
                answer=Answer(kind="text",text="Free response"))


def test_json_parser_accepts_explicit_question_only():
    payload={"topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["A","B","C"]}
    assert parse_question_output(json.dumps({"grillQuestion":payload})) == payload
    for text in ("Ask this question",json.dumps({"grillQuestion":payload,"navigate":"https://invalid"})):
        with pytest.raises(ValueError): parse_question_output(text)


def test_persisted_foreign_scope_and_changed_mode_revision_fail_closed(chat):
    hub,scope,session,_ = chat
    start(chat)
    original = json.loads(json.dumps(session.grill_state))
    session.grill_state["scope"]["browserProfileId"] = "foreign"
    with pytest.raises(ScopeError):
        read_grill(session,scope.model_dump(by_alias=True),actor="default",profile_hub=hub)
    session.grill_state = original
    session.chat_execution_mode["revision"] += 1
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,"review",1,"request-0002"),actor="default",profile_hub=hub)
    assert session.grill_state == original


def test_pending_question_blocks_model_overwrite_and_false_free_text(chat):
    start(chat)
    state = question(load_state(chat[2].grill_state))
    with pytest.raises(GrillConflict): question(state)
    raw = state.model_dump(mode="json",by_alias=True)
    raw["questions"][0]["allowFreeText"] = False
    with pytest.raises(ValidationError): load_state(raw)


@pytest.mark.parametrize("extra",[{"permission":"write"},{"navigate":"https://invalid"},{"tool":"terminal"}])
def test_user_command_cannot_carry_execution_authority(chat,extra):
    hub,scope,session,_ = chat
    with pytest.raises(ValidationError):
        command_grill(session,body(scope,session,objective="Goal",**extra),actor="default",profile_hub=hub)
    assert session.grill_state is None


def test_worker_publish_requires_actual_bound_context_and_lease(tmp_path,monkeypatch):
    from test_native_chat_process import fixture_context
    from runtime.independent import native_chat_policy
    from runtime.independent.native_chat_host import build_native_environment
    context,store = fixture_context(tmp_path,"a")
    try:
        for key,value in build_native_environment(context).items(): monkeypatch.setenv(key,value)
        monkeypatch.setattr(native_chat_policy,"_context",None)
        native_chat_policy.bind_native_policy(context)
        state = GrillState(scope=context.scope,sessionId=context.session_id,modeRevision=1,objective="Goal")
        saved=[]
        session=SimpleNamespace(session_id=context.session_id,profile="a",space_scope=context.scope.model_dump(by_alias=True),
            workspace=context.workspace,active_stream_id=context.stream_id,
            chat_execution_mode={"schemaVersion":1,"mode":"grill_me","lifetime":"chat","revision":1},
            grill_state=state.model_dump(mode="json",by_alias=True),save=lambda **_:saved.append(True))
        proposal={"topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["A","B","C"]}
        result=publish_grill_question(session,proposal,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
        assert saved == [True] and result["grill"]["revision"] == 1
        assert result["streamId"] == context.stream_id and result["writerGeneration"] == context.writer_generation
        with pytest.raises(ScopeError):
            publish_grill_question(session,proposal,policy=ChatExecutionPolicy("action",1),context=context,expected_revision=1)
        store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
        with pytest.raises(PermissionError):
            publish_grill_question(session,proposal,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=1)
    finally: store.close()


@pytest.fixture
def actual_session(tmp_path,monkeypatch):
    from pathlib import Path
    from test_native_chat_process import fixture_context
    from runtime.independent import native_chat_policy
    from runtime.independent.chat_binding import _OWN_WRITERS
    from runtime.independent.native_chat_host import build_native_environment
    from runtime.independent.scope import ScopeResolver
    from web.api import config, independent, models
    context,store=fixture_context(tmp_path,"a")
    resolver=ScopeResolver(store,profiles_provider=lambda:[{"name":"a","path":context.profile_home}])
    def by_scope(scope,actor):
        if scope != context.scope or actor != "a": raise ScopeError("Private fixture scope mismatch")
        return store,resolver
    monkeypatch.setattr(independent,"hub",lambda:SimpleNamespace(by_scope=by_scope))
    directory=Path(context.sessions_dir)
    monkeypatch.setattr(models,"get_session_dir",lambda:directory)
    monkeypatch.setattr(config,"SESSION_DIR",directory)
    for key,value in build_native_environment(context).items(): monkeypatch.setenv(key,value)
    monkeypatch.setattr(native_chat_policy,"_context",None)
    native_chat_policy.bind_native_policy(context)
    token=_OWN_WRITERS.set((context.writer_lease_id,))
    raw=json.loads((directory/(context.session_id+".json")).read_text("utf-8"))
    raw.update(chat_execution_mode={"schemaVersion":1,"mode":"grill_me","lifetime":"chat","revision":1},
        grill_state=GrillState(scope=context.scope,sessionId=context.session_id,modeRevision=1,
            objective="Understand requirements").model_dump(mode="json",by_alias=True))
    session=models.Session(**raw)
    yield session,context,store
    _OWN_WRITERS.reset(token)
    store.close()


def test_actual_session_metadata_and_full_json_restart(actual_session):
    from web.api.models import Session
    session,context,_=actual_session
    session.messages=[{"role":"user","content":"Historical message"}]
    session.save()
    raw=session.path.read_text("utf-8")
    assert raw.index('"grill_state"') < raw.index('"messages"')
    metadata=Session.load_metadata_only(context.session_id)
    assert metadata.grill_state == session.grill_state and metadata._loaded_metadata_only
    full=Session.load(context.session_id)
    assert full.grill_state == session.grill_state and full.messages == session.messages


def test_complete_actual_output_saves_display_and_state_but_preserves_sdk_context(actual_session):
    session,context,_=actual_session
    output=json.dumps({"grillQuestion":{"topicId":"audience","topicLabel":"Audience",
        "prompt":"Who uses the browser?","options":["Individuals","Teams","Both"]}})
    session.messages=[{"role":"user","content":"Start"},{"role":"assistant","content":output,
        "grill_fallback":{"reason":"invalid_structured_question","streamId":"old","writerGeneration":"old"}}]
    session.context_messages=session.messages
    original_context=json.loads(json.dumps(session.context_messages))
    event,data=complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    saved=json.loads(session.path.read_text("utf-8"))
    assert event == "grill" and data["grill"]["questions"][0]["prompt"] == "Who uses the browser?"
    assert saved["messages"][-1]["content"] == "Who uses the browser?"
    assert saved["messages"][-1]["grill_question"]["questionId"] == data["grill"]["questions"][0]["questionId"]
    assert "grill_fallback" not in saved["messages"][-1]
    assert saved["context_messages"] == original_context == session.context_messages
    assert saved["grill_state"]["revision"] == 1


@pytest.mark.parametrize("invalid",[True,False])
def test_complete_actual_output_fallback_is_readable_without_fake_controls(actual_session,invalid):
    session,context,_=actual_session
    text="Actual unstructured clarification "*400 if invalid else json.dumps({"grillQuestion":{
        "topicId":"audience","topicLabel":"Audience","prompt":"Question","options":["A","B","C"]}})
    if not invalid: session.grill_state=None
    session.messages=[{"role":"assistant","content":text}]
    session.context_messages=[{"role":"assistant","content":text}]
    event,data=complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    assert event == "grill_fallback" and len(data["readableText"]) <= 8192
    assert data["reason"] == ("invalid_structured_question" if invalid else "question_state_unavailable")
    saved=json.loads(session.path.read_text("utf-8"))
    assert saved["messages"][-1]["content"] == text[:8192]
    assert "grill_question" not in saved["messages"][-1]
    assert saved["context_messages"][-1]["content"] == text
    from web.api.models import Session
    reloaded=Session.load(context.session_id)
    marker=reloaded.messages[-1]["grill_fallback"]
    assert marker == {"reason":data["reason"],"streamId":context.stream_id,
        "writerGeneration":context.writer_generation}
    assert set(marker) == {"reason","streamId","writerGeneration"}


def test_complete_save_failure_rolls_back_display_and_state(actual_session,monkeypatch):
    session,context,_=actual_session
    output=json.dumps({"grillQuestion":{"topicId":"audience","topicLabel":"Audience",
        "prompt":"Question","options":["A","B","C"]}})
    session.messages=[{"role":"assistant","content":output}]
    previous=json.loads(json.dumps(session.grill_state))
    def fail(**_): raise OSError("Private fixture persistence failure")
    monkeypatch.setattr(session,"save",fail)
    with pytest.raises(OSError):
        complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    assert session.messages[-1]["content"] == output and session.grill_state == previous


def test_complete_invalid_output_cannot_fallback_after_lease_revocation(actual_session):
    session,context,store=actual_session
    session.messages=[{"role":"assistant","content":"Actual plain response"}]
    store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    with pytest.raises(PermissionError):
        complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    assert not session.path.exists() or json.loads(session.path.read_text("utf-8"))["messages"] == []


def test_explicit_resume_after_mode_off_on_preserves_corrected_answers(chat):
    from web.api.chat_modes import change_chat_mode
    hub,scope,session,_=chat
    start(chat)
    state=question(load_state(session.grill_state))
    q=state.questions[-1]
    state=answer_question(state,expected_revision=2,question_id=q.question_id,question_revision=0,
        answer=Answer(kind="text",text="Corrected user preference"))
    session.grill_state=state.model_dump(mode="json",by_alias=True)
    for mode,revision,request in (("action",2,"mode-off-001"),("grill_me",3,"mode-on-0001")):
        change_chat_mode(session,{"space_scope":scope.model_dump(by_alias=True),"mode":mode,"lifetime":"chat",
            "expected_revision":revision,"client_request_id":request},actor="default",profile_hub=hub)
    assert session.chat_execution_mode["revision"] == 4
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,"review",3,"request-review"),actor="default",profile_hub=hub)
    command=body(scope,session,"resume",3,"request-resume")
    resumed=command_grill(session,command,actor="default",profile_hub=hub)["grill"]
    assert resumed["revision"] == 4 and resumed["modeRevision"] == 4
    assert resumed["status"] == "asking" and resumed["summary"][0]["answer"] == "Corrected user preference"
    replay=command_grill(session,command,actor="default",profile_hub=hub)
    assert replay["replayed"] and replay["grill"]["revision"] == 4


def test_explicit_finished_restart_cas_replay_and_json_history_preservation(chat):
    hub,scope,session,path=chat
    start(chat)
    finish=body(scope,session,"finish",1,"request-finish")
    command_grill(session,finish,actor="default",profile_hub=hub)
    previous=json.loads(json.dumps(session.grill_state))
    with pytest.raises(GrillConflict):
        command_grill(session,body(scope,session,revision=1,request="request-restart",objective="New objective"),
            actor="default",profile_hub=hub)
    command=body(scope,session,revision=2,request="request-restart",objective="New objective")
    restarted=command_grill(session,command,actor="default",profile_hub=hub)["grill"]
    assert restarted["revision"] == 3 and restarted["status"] == "asking"
    assert restarted["objective"] == "New objective" and restarted["questions"] == []
    assert session.grill_history == [previous]
    replay=command_grill(session,command,actor="default",profile_hub=hub)
    assert replay["replayed"] and len(session.grill_history) == 1
    historic=command_grill(session,finish,actor="default",profile_hub=hub)
    assert historic["replayed"] and historic["historical"] and historic["commandRevision"] == 2
    assert historic["grill"]["revision"] == 3
    saved=json.loads(path.read_text("utf-8"))
    recovered=SimpleNamespace(**saved,save=session.save)
    snapshot=read_grill(recovered,scope.model_dump(by_alias=True),actor="default",profile_hub=hub)
    assert snapshot["grillHistory"][0]["objective"] == previous["objective"]
    assert snapshot["grillHistory"][0]["status"] == "finished"
    with pytest.raises(GrillConflict):
        command_grill(session,{**command,"objective":"Identity reuse"},actor="default",profile_hub=hub)


def test_restart_save_failure_rolls_back_history_and_finished_state(chat):
    hub,scope,session,_=chat
    start(chat)
    command_grill(session,body(scope,session,"finish",1,"request-finish"),actor="default",profile_hub=hub)
    previous=json.loads(json.dumps(session.grill_state))
    def fail(**_): raise OSError("Private fixture persistence failure")
    session.save=fail
    with pytest.raises(OSError):
        command_grill(session,body(scope,session,revision=2,request="request-restart",objective="New interview"),
            actor="default",profile_hub=hub)
    assert session.grill_state == previous and session.grill_history == []


def test_actual_session_finished_restart_preserves_history_in_metadata_and_full_load(actual_session):
    from web.api.models import Session
    from web.api.independent import hub
    session,context,store=actual_session
    session.active_stream_id=None
    session.messages=[{"role":"user","content":"Keep historical conversation"}]
    session.save()
    store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    command_grill(session,body(context.scope,session,"finish",0,"request-finish"),
        actor="a",profile_hub=hub())
    old=json.loads(json.dumps(session.grill_state))
    command_grill(session,body(context.scope,session,revision=1,request="request-restart",objective="Another interview"),
        actor="a",profile_hub=hub())
    full=Session.load(context.session_id)
    metadata=Session.load_metadata_only(context.session_id)
    assert full.grill_history == [old] == metadata.grill_history
    assert full.grill_state["objective"] == "Another interview"
    assert full.messages == [{"role":"user","content":"Keep historical conversation"}]


def test_fallback_marker_cannot_be_saved_for_foreign_session_scope(actual_session):
    session,context,_=actual_session
    session.messages=[{"role":"assistant","content":"Actual unstructured response",
        "grill_fallback":{"reason":"injected","streamId":"foreign","writerGeneration":"foreign","secret":"private fixture"}}]
    original=session.path.read_bytes()
    session.space_scope={**session.space_scope,"browserProfileId":"foreign"}
    with pytest.raises(ScopeError):
        complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    from pathlib import Path
    saved=Path(context.sessions_dir)/(context.session_id+".json")
    assert saved.read_bytes() == original


def test_fallback_marker_replaces_untrusted_extra_fields(actual_session):
    session,context,_=actual_session
    session.messages=[{"role":"assistant","content":"Actual unstructured response",
        "grill_fallback":{"reason":"injected","streamId":"foreign","writerGeneration":"foreign","secret":"private fixture"}}]
    _,data=complete_grill_output(session,policy=ChatExecutionPolicy("grill_me",1),context=context,expected_revision=0)
    saved=json.loads(session.path.read_text("utf-8"))
    assert saved["messages"][-1]["grill_fallback"] == {
        "reason":"invalid_structured_question","streamId":context.stream_id,"writerGeneration":context.writer_generation}
    assert data["reason"] == "invalid_structured_question"
