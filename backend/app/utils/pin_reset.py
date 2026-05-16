import random
import time

# { phone: { 'code': '1234', 'expires': float_timestamp } }
_codes: dict = {}

CODE_TTL = 900  # 15 minutes


def generate_code(phone: str) -> str:
    code = f"{random.randint(0, 9999):04d}"
    _codes[phone] = {'code': code, 'expires': time.time() + CODE_TTL}
    return code


def verify_code(phone: str, code: str) -> bool:
    entry = _codes.get(phone)
    if not entry:
        return False
    if time.time() > entry['expires']:
        del _codes[phone]
        return False
    if entry['code'] != str(code).strip():
        return False
    del _codes[phone]
    return True
