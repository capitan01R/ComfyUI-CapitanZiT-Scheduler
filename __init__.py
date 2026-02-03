# __init__.py
from .capitan_zit_scheduler import (
    NODE_CLASS_MAPPINGS as CAPITAN_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as CAPITAN_DISPLAY
)
from .minimal_change_sampler import (
    NODE_CLASS_MAPPINGS as MINIMAL_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as MINIMAL_DISPLAY
)
from .smooth_cosine_scheduler import (
    NODE_CLASS_MAPPINGS as SMOOTH_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as SMOOTH_DISPLAY
)

# Combine all node mappings
NODE_CLASS_MAPPINGS = {
    **CAPITAN_MAPPINGS,
    **MINIMAL_MAPPINGS,
    **SMOOTH_MAPPINGS
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **CAPITAN_DISPLAY,
    **MINIMAL_DISPLAY,
    **SMOOTH_DISPLAY
}

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS"
]

__version__ = "1.1.0"
