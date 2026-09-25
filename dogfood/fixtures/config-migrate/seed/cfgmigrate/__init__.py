"""cfgmigrate — upgrade application config documents to the current schema version."""

from cfgmigrate.migrate import CURRENT_VERSION, UnsupportedVersionError, migrate

__all__ = ["CURRENT_VERSION", "UnsupportedVersionError", "migrate"]
