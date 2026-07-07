"""
app/schemas/common.py
──────────────────────
Shared Pydantic response shapes used across all routers.
"""

from typing import Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class SuccessResponse(BaseModel):
    message: str
    success: bool = True


class ErrorResponse(BaseModel):
    error: str
    message: str


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Wrap any list response with pagination metadata.

    Usage:
        return PaginatedResponse(
            items=orders,
            total=100,
            page=1,
            page_size=20,
        )
    """
    items: list[T]
    total: int
    page: int
    page_size: int

    @property
    def total_pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size