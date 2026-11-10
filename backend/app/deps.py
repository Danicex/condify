"""
Current-user dependency. The real implementation lives in routers/auth.py (Bearer JWT from the wallet-signature login,
plus an X-Dev-Address header only when AUTH_DEV_MODE=1). Re-exported here so routers can keep importing it from app.deps.
"""
from app.routers.auth import CurrentUser, get_current_user  # noqa: F401
