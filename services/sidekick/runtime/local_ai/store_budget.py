"""Private production budgets, captured from trusted fresh host observations."""
from dataclasses import dataclass
from datetime import datetime
import time

RESERVE_BYTES=4*1024**3
_SEAL=object()


@dataclass(frozen=True)
class StoreMemoryBudget:
    limit_bytes:int
    scope_key:str
    observed_at:float
    available_bytes:int
    _seal:object
    source:str='trusted-main-observation'

    def validate(self,limit):
        if (self._seal is not _SEAL or type(limit) is not int or limit!=self.limit_bytes
                or limit<16*1024**2 or not self.scope_key
                or not 0<=time.time()-self.observed_at<=30
                or self.available_bytes<limit+RESERVE_BYTES):
            raise ValueError('store_memory_budget_invalid')
        import psutil
        if psutil.virtual_memory().available<limit+RESERVE_BYTES:
            raise ValueError('insufficient_available_ram')

    def reserve_available(self):
        import psutil
        return psutil.virtual_memory().available>=RESERVE_BYTES


def capture_memory_budget(hardware,required_bytes,scope_key):
    fact=(hardware or {}).get('ramAvailableBytes',{})
    if (type(required_bytes) is not int or required_bytes<16*1024**2
            or fact.get('status')!='measured' or type(fact.get('value')) is not int):
        raise ValueError('store_memory_budget_invalid')
    try:observed=datetime.fromisoformat(hardware['observedAt'].replace('Z','+00:00')).timestamp()
    except (KeyError,TypeError,ValueError):raise ValueError('store_memory_budget_invalid') from None
    budget=StoreMemoryBudget(required_bytes,scope_key,observed,fact['value'],_SEAL)
    budget.validate(required_bytes)
    return budget


def capture_runtime_memory_budget(required_bytes,scope_key):
    """After potentially long hashing, observe RAM without rewriting Main data.

    The Store must already have passed its normal scoped Main/device/disk guard.
    This private observation grants no device identity, GPU or install consent.
    """
    import psutil
    available=psutil.virtual_memory().available
    if type(required_bytes) is not int or required_bytes<16*1024**2:
        raise ValueError('store_memory_budget_invalid')
    budget=StoreMemoryBudget(required_bytes,scope_key,time.time(),available,_SEAL,
                             'backend-psutil-after-artifact-verification')
    budget.validate(required_bytes)
    return budget
