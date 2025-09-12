import logging
import logging.config

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "format": '{"ts": %(asctime)s, "level": "%(levelname)s", "service": "%(name)s", "msg": %(message)s }'
        },
    },
    "handlers": {
        "file": {
            "class": "logging.FileHandler",
            "filename": "data/logs/service.log",
            "formatter": "json",
            "encoding": "utf-8"
        },
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json"
        }
    },
    "root": {
        "handlers": ["file", "console"],
        "level": "INFO"
    }
}

def setup_logging():
    logging.config.dictConfig(LOGGING_CONFIG)