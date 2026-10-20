"""Провайдеры языковых моделей со стримингом.

openai    — любой OpenAI-совместимый API: OpenAI, YandexGPT (llm.api.cloud.yandex.net/v1), Ollama, DeepSeek…
anthropic — Claude через Messages API.
none      — без модели: отвечает локальная база знаний.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from ..core.config import settings


class LLMUnavailable(RuntimeError):
    pass


async def _openai_stream(system: str, history: list[dict]) -> AsyncIterator[str]:
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    if settings.llm_folder_id:
        headers["x-folder-id"] = settings.llm_folder_id
    body = {
        "model": settings.llm_model,
        "messages": [{"role": "system", "content": system}, *history],
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
        "stream": True,
    }
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as client:
        async with client.stream("POST", url, headers=headers, json=body) as resp:
            if resp.status_code != 200:
                raise LLMUnavailable(f"LLM HTTP {resp.status_code}: {(await resp.aread())[:300]!r}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    delta = json.loads(payload)["choices"][0]["delta"].get("content")
                except (KeyError, IndexError, json.JSONDecodeError):
                    continue
                if delta:
                    yield delta


async def _anthropic_stream(system: str, history: list[dict]) -> AsyncIterator[str]:
    headers = {
        "x-api-key": settings.llm_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "system": system,
        "messages": history,
        "max_tokens": settings.llm_max_tokens,
        "temperature": settings.llm_temperature,
        "stream": True,
    }
    base = settings.llm_base_url if "anthropic" in settings.llm_base_url else "https://api.anthropic.com/v1"
    async with httpx.AsyncClient(timeout=httpx.Timeout(60, connect=10)) as client:
        async with client.stream("POST", base.rstrip("/") + "/messages", headers=headers, json=body) as resp:
            if resp.status_code != 200:
                raise LLMUnavailable(f"LLM HTTP {resp.status_code}: {(await resp.aread())[:300]!r}")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    event = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "content_block_delta":
                    text = event.get("delta", {}).get("text")
                    if text:
                        yield text


def llm_enabled() -> bool:
    return settings.llm_provider in {"openai", "anthropic"} and bool(settings.llm_api_key)


async def stream_answer(system: str, history: list[dict]) -> AsyncIterator[str]:
    if not llm_enabled():
        raise LLMUnavailable("LLM не настроена")
    gen = _anthropic_stream if settings.llm_provider == "anthropic" else _openai_stream
    async for chunk in gen(system, history):
        yield chunk
