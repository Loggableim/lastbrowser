"""Provider request-parameter compatibility regressions."""

from run_agent import _unsupported_sampling_parameter


def test_detects_openrouter_route_rejecting_top_p():
    error = Exception("HTTP 400: The `top_p` parameter is not supported.")

    assert _unsupported_sampling_parameter(error, {"top_p": 0.95}) == "top_p"


def test_detects_unsupported_temperature_when_sent():
    error = Exception("unsupported_parameter: temperature")

    assert _unsupported_sampling_parameter(error, {"temperature": 0.6}) == "temperature"


def test_does_not_retry_without_a_matching_optional_parameter():
    error = Exception("HTTP 429: rate limit exceeded")

    assert _unsupported_sampling_parameter(error, {"top_p": 0.95}) is None
    assert _unsupported_sampling_parameter(
        Exception("top_p is not supported"), {"model": "test-model"}
    ) is None
