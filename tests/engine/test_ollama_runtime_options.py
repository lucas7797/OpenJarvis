"""Tests for Ollama runtime option wiring (num_ctx / num_gpu)."""

from __future__ import annotations

from unittest.mock import MagicMock

from openjarvis.core.types import Message, Role
from openjarvis.engine.ollama import OllamaEngine, _keep_alive, _ollama_request_options


def test_keep_alive_unset_by_default(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.delenv("JARVIS_OLLAMA_KEEP_ALIVE", raising=False)
    assert _keep_alive() is None


def test_keep_alive_from_env(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("JARVIS_OLLAMA_KEEP_ALIVE", " 30m ")
    assert _keep_alive() == "30m"


def test_generate_sends_keep_alive(monkeypatch) -> None:  # noqa: ANN001
    """Keeping the model loaded avoids a multi-second reload on the next request."""
    monkeypatch.setenv("JARVIS_OLLAMA_KEEP_ALIVE", "30m")
    engine = OllamaEngine(host="http://ollama.test")
    resp = MagicMock(status_code=200)
    resp.json.return_value = {"message": {"content": "hi"}, "done": True}
    engine._client = MagicMock(post=MagicMock(return_value=resp))

    engine.generate([Message(role=Role.USER, content="hello")], model="m")

    payload = engine._client.post.call_args.kwargs["json"]
    assert payload["keep_alive"] == "30m"


def test_generate_omits_keep_alive_when_unset(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.delenv("JARVIS_OLLAMA_KEEP_ALIVE", raising=False)
    engine = OllamaEngine(host="http://ollama.test")
    resp = MagicMock(status_code=200)
    resp.json.return_value = {"message": {"content": "hi"}, "done": True}
    engine._client = MagicMock(post=MagicMock(return_value=resp))

    engine.generate([Message(role=Role.USER, content="hello")], model="m")

    assert "keep_alive" not in engine._client.post.call_args.kwargs["json"]


def test_with_explicit_runtime_kwargs() -> None:
    opts = _ollama_request_options(
        temperature=0.5,
        max_tokens=512,
        kwargs={"num_ctx": 64000, "num_gpu": 12},
    )
    assert opts["num_ctx"] == 64000
    assert opts["num_gpu"] == 12


def test_default_num_ctx_when_omitted(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("JARVIS_NUM_CTX", "24576")
    opts = _ollama_request_options(
        temperature=0.7,
        max_tokens=1024,
        kwargs={},
    )
    assert opts["num_ctx"] == 24576
    assert "num_gpu" not in opts
