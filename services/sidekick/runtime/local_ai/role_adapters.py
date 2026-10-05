"""Typed local operations; returned tools/data never execute external effects."""
from __future__ import annotations
import base64
import json
import math
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract
from .contracts import Role


class RoleRequest(Contract):
    role: Role
    texts: tuple[Annotated[str, Field(min_length=1, max_length=65536)], ...]
    max_output_tokens: Annotated[int, Field(gt=0, le=2048)] = 256
    image_base64: Annotated[str, Field(max_length=4194304)] | None = None
    input_kind: Literal['query', 'document'] | None = None

    @model_validator(mode='after')
    def bounded(self):
        if not 1 <= len(self.texts) <= 8 or sum(map(len, self.texts)) > 131072:
            raise ValueError('local_operation_input_budget_exceeded')
        if self.role in ('agent', 'chat', 'extract', 'vision') and len(self.texts) != 1:
            raise ValueError('local_chat_requires_one_input')
        if self.role == 'chat' and self.max_output_tokens > 48:
            raise ValueError('local_chat_output_budget_exceeded')
        if self.role == 'vision':
            if not self.image_base64: raise ValueError('local_vision_requires_image')
            raw = base64.b64decode(self.image_base64, validate=True)
            if not raw.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')):
                raise ValueError('local_vision_image_format_rejected')
        elif self.image_base64 is not None:
            raise ValueError('unexpected_local_image')
        if self.role == 'encoder': raise ValueError('encoder_requires_task_head_adapter')
        return self


def prepared_texts(request: RoleRequest, adapter=None):
    if request.role in ('embed', 'retrieve') and adapter is not None:
        if request.input_kind is None: raise ValueError('local_embedding_input_kind_required')
        prefix = adapter.query_prefix if request.input_kind == 'query' else adapter.document_prefix
        return tuple(prefix + text for text in request.texts)
    return request.texts


def operation_payload(request: RoleRequest, artifact_id: str, adapter=None) -> tuple[str, dict]:
    if request.role == 'retrieve' and adapter and adapter.endpoint == '/embedding':
        raise ValueError('colbert_requires_pinned_token_padding_and_skiplist_adapter')
    if request.role in ('embed', 'retrieve'):
        return '/v1/embeddings', {'model': artifact_id, 'input': list(prepared_texts(request, adapter)), 'encoding_format': 'float'}
    content = request.texts[0]
    if request.role == 'vision':
        content = [{'type': 'text', 'text': content}, {'type': 'image_url', 'image_url': {'url': 'data:image/' +
            ('png' if base64.b64decode(request.image_base64).startswith(b'\x89PNG') else 'jpeg') + ';base64,' + request.image_base64}}]
    payload = {'model': artifact_id, 'messages': [{'role': 'user', 'content': content}],
        'max_tokens': request.max_output_tokens, 'stream': False, 'temperature': 0}
    if request.role == 'extract': payload['response_format'] = {'type': 'json_object'}
    return '/v1/chat/completions', payload


def validate_result(request: RoleRequest, value: dict) -> dict:
    if request.role in ('embed', 'retrieve'):
        data = value.get('data')
        if not isinstance(data, list) or len(data) != len(request.texts): raise ValueError('local_embedding_batch_mismatch')
        output = []
        for index, item in enumerate(data):
            if not isinstance(item, dict) or item.get('index') != index: raise ValueError('local_embedding_index_mismatch')
            embedding = item.get('embedding')
            vectors = [embedding] if request.role == 'embed' else embedding
            if not isinstance(vectors, list) or not 1 <= len(vectors) <= 4096: raise ValueError('local_embedding_shape_invalid')
            dimension = 1024 if request.role == 'embed' else 128
            for vector in vectors:
                if not isinstance(vector, list) or len(vector) != dimension or any(type(number) not in (int, float) or not math.isfinite(number) for number in vector):
                    raise ValueError('local_embedding_dimension_invalid')
            output.append(embedding)
        return {'role': request.role, 'embeddings': output}
    choices = value.get('choices')
    if not isinstance(choices, list) or len(choices) != 1 or not isinstance(choices[0], dict): raise ValueError('local_chat_shape_invalid')
    message = choices[0].get('message')
    if not isinstance(message, dict): raise ValueError('local_chat_message_invalid')
    text = message.get('content')
    if not isinstance(text, str) or len(text) > 65536: raise ValueError('local_chat_content_invalid')
    if request.role == 'extract':
        parsed = json.loads(text)
        if not isinstance(parsed, (dict, list)): raise ValueError('local_extraction_json_invalid')
        return {'role': request.role, 'extraction': parsed}
    # Tool declarations are data; actual approval/effect execution belongs to host.
    tools = message.get('tool_calls', [])
    if not isinstance(tools, list) or len(tools) > 16: raise ValueError('local_tool_call_shape_invalid')
    if tools and request.role != 'agent': raise ValueError('unexpected_local_tool_calls')
    for tool in tools:
        if not isinstance(tool, dict) or tool.get('type') != 'function' or not isinstance(tool.get('function'), dict): raise ValueError('local_tool_call_shape_invalid')
        function = tool['function']
        if not isinstance(function.get('name'), str) or not 1 <= len(function['name']) <= 128 or not isinstance(function.get('arguments'), str) or len(function['arguments']) > 16384:
            raise ValueError('local_tool_call_shape_invalid')
        if not isinstance(json.loads(function['arguments']), dict): raise ValueError('local_tool_arguments_invalid')
    return {'role': request.role, 'text': text, 'toolCalls': tools}
