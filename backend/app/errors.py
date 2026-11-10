"""One expected-failure type for the whole API: main.py turns it into {"detail": message} with the given status."""


class ApiError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
