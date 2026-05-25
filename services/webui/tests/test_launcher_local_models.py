from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_gui_launcher_requires_openai_model_endpoint():
    src = (ROOT / "Hermes Launcher.ps1").read_text(encoding="utf-8")
    assert "function Test-ModelReady" in src
    assert "/v1/models" in src
    assert "Ensure-ModelServer" in src
    assert "Stop-PortProcesses" in src
    assert "Wait-ModelReady $Port" in src
    assert 'Ensure-ModelServer "gpu"' in src
    assert 'Ensure-ModelServer "cpu"' in src


def test_batch_launcher_waits_for_model_endpoint_with_timeout():
    src = (ROOT / "launcher.bat").read_text(encoding="utf-8")
    assert ":wait_for_model" in src
    assert ":sleep_seconds" in src
    assert "/v1/models" in src
    assert "WAIT_MAX" in src
    assert "WAIT_PORT_MAX" in src
    assert "goto :wait_model_timeout" in src
    assert "call :wait_for_model %GPU_PORT%" in src
    assert "call :wait_for_model %CPU_PORT%" in src
    assert "timeout /t" not in src.lower()
    assert "ping -n" in src.lower()


def test_batch_launcher_uses_tcp_wait_for_camofox_and_safe_quoting():
    src = (ROOT / "launcher.bat").read_text(encoding="utf-8")
    assert ":wait_for_tcp" in src
    assert "call :wait_for_tcp %CAMOFOX_PORT%" in src
    assert 'pushd "%CAMOFOX_DIR%"' in src
    assert 'start "camofox" /min cmd /c npm start' in src
    assert "popd" in src
    assert "(Anti-Detection)" not in src


def test_batch_launcher_marks_chromium_app_window_for_internal_controls():
    src = (ROOT / "launcher.bat").read_text(encoding="utf-8")
    assert 'set "WEBUI_APP_URL=%WEBUI_URL%/?hermes_app=1"' in src
    assert 'set "FRAMELESS_SCRIPT=%ROOT%Hermes-Frameless.ps1"' in src
    assert '--app="%WEBUI_APP_URL%"' in src
    assert "--enable-features=WebAppWindowControlsOverlay" in src
    assert "call :strip_webui_frame" in src
    assert "Hermes-Frameless.ps1" in src
