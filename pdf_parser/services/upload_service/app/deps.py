from typing import Annotated

from fastapi import Depends

from app.config import Settings, get_settings
from app.storage.local_storage import LocalObjectStorage


def get_storage(settings: Annotated[Settings, Depends(get_settings)]) -> LocalObjectStorage:
    return LocalObjectStorage(settings)
