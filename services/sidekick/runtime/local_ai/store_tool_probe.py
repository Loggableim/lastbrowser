"""Actual local tools/tool_calls roundtrip, without executing external effects."""
import json
import re
import time


def probe_tool_api(session,entry,cancel):
    started=time.monotonic()
    result={'version':'llama-cpp-tool-api-roundtrip-v1','passed':False,
            'api':'openai_chat_completions_tools','externalEffectsExecuted':False}
    try:
        if cancel.is_set():raise RuntimeError('local_probe_cancelled')
        schema={'type':'function','function':{'name':'local_test_sum','description':'Return the sum of two integers.',
            'parameters':{'type':'object','properties':{'a':{'type':'integer'},'b':{'type':'integer'}},
                          'required':['a','b'],'additionalProperties':False}}}
        messages=[{'role':'user','content':'Use local_test_sum to calculate 2 plus 3. After the tool result, answer with the result number.'}]
        payload={'model':entry['id'],'messages':messages,'tools':[schema],
                 'tool_choice':{'type':'function','function':{'name':'local_test_sum'}},'max_tokens':128,'temperature':0}
        if entry['artifactManifest'].get('chatTemplateKwargs'):payload['chat_template_kwargs']=entry['artifactManifest']['chatTemplateKwargs']
        first=session.call('/v1/chat/completions',payload,timeout=45)
        choices=first.get('choices',[])
        if len(choices)!=1:raise ValueError('tool_api_choice_invalid')
        message=choices[0].get('message',{});calls=message.get('tool_calls',[])
        if len(calls)!=1:raise ValueError('tool_api_call_missing')
        call=calls[0];function=call.get('function',{});identity=call.get('id')
        if (call.get('type')!='function' or function.get('name')!='local_test_sum'
                or not isinstance(identity,str) or not 1<=len(identity)<=128):raise ValueError('tool_api_call_invalid')
        encoded=function.get('arguments')
        if not isinstance(encoded,str) or len(encoded)>1024:raise ValueError('tool_api_arguments_invalid')
        arguments=json.loads(encoded)
        if (not isinstance(arguments,dict) or set(arguments)!={'a','b'}
                or any(type(value) is not int for value in arguments.values()) or arguments!={'a':2,'b':3}):
            raise ValueError('tool_api_arguments_invalid')
        if cancel.is_set():raise RuntimeError('local_probe_cancelled')
        # This allowlisted in-memory arithmetic is the entire tool effect.
        messages += [{'role':'assistant','content':None,'tool_calls':[{'id':identity,'type':'function','function':function}]},
                     {'role':'tool','tool_call_id':identity,'name':'local_test_sum','content':'{"value":5}'}]
        payload={**payload,'messages':messages,'tool_choice':'none','max_tokens':64}
        second=session.call('/v1/chat/completions',payload,timeout=45)
        choices=second.get('choices',[])
        if len(choices)!=1:raise ValueError('tool_api_choice_invalid')
        final=choices[0].get('message',{})
        if final.get('tool_calls'):raise ValueError('tool_api_unexpected_followup_call')
        answer=final.get('content')
        if not isinstance(answer,str) or len(answer)>1024 or not re.search(r'(?<!\d)5(?!\d)',answer):
            raise ValueError('tool_api_result_not_acknowledged')
        result.update(passed=True,argumentsMatched=True,resultAcknowledged=True)
    except Exception as exc:
        message=str(exc)
        result['reasonCode']=message if re.fullmatch('[a-z_]{1,100}',message or '') else 'tool_api_probe_failed'
    result['elapsedMs']=(time.monotonic()-started)*1000
    return result
