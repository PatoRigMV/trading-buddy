"""
Standardized API response helpers for Trading Assistant.

Provides consistent response formats across all endpoints.
"""

from datetime import datetime
from typing import Any, Dict, Optional

from flask import jsonify


class APIResponse:
    """
    Standardized API response builder.

    All responses follow this format:
    {
        "success": true/false,
        "data": {...},           // Only on success
        "error": {...},          // Only on failure
        "meta": {...},           // Optional metadata
        "timestamp": "ISO 8601"
    }
    """

    @staticmethod
    def success(data: Any = None, message: Optional[str] = None, meta: Optional[Dict] = None, status_code: int = 200):
        """
        Return successful response.

        Args:
            data: Response data (dict, list, or primitive)
            message: Optional success message
            meta: Optional metadata (pagination, etc.)
            status_code: HTTP status code (default 200)

        Returns:
            Flask response tuple (jsonify, status_code)
        """
        response = {"success": True, "timestamp": datetime.now().isoformat()}

        if data is not None:
            response["data"] = data

        if message:
            response["message"] = message

        if meta:
            response["meta"] = meta

        return jsonify(response), status_code

    @staticmethod
    def error(message: str, status_code: int = 400, error_code: Optional[str] = None, details: Any = None):
        """
        Return error response.

        Args:
            message: Human-readable error message
            status_code: HTTP status code (400, 404, 500, etc.)
            error_code: Machine-readable error code
            details: Additional error details (validation errors, etc.)

        Returns:
            Flask response tuple (jsonify, status_code)
        """
        error_obj: Dict[str, Any] = {"message": message}

        if error_code:
            error_obj["code"] = error_code

        if details:
            error_obj["details"] = details

        response = {"success": False, "error": error_obj, "timestamp": datetime.now().isoformat()}

        return jsonify(response), status_code

    @staticmethod
    def validation_error(errors: Dict, message: str = "Validation failed"):
        """
        Return validation error response (400).

        Args:
            errors: Validation error details (from marshmallow)
            message: Error message

        Returns:
            Flask response tuple (jsonify, 400)
        """
        return APIResponse.error(message=message, status_code=400, error_code="VALIDATION_ERROR", details=errors)

    @staticmethod
    def not_found(message: str = "Resource not found", resource: Optional[str] = None):
        """
        Return 404 not found response.

        Args:
            message: Error message
            resource: Resource type that wasn't found

        Returns:
            Flask response tuple (jsonify, 404)
        """
        error_code = f"{resource.upper()}_NOT_FOUND" if resource else "NOT_FOUND"
        return APIResponse.error(message=message, status_code=404, error_code=error_code)

    @staticmethod
    def unauthorized(message: str = "Unauthorized"):
        """
        Return 401 unauthorized response.

        Args:
            message: Error message

        Returns:
            Flask response tuple (jsonify, 401)
        """
        return APIResponse.error(message=message, status_code=401, error_code="UNAUTHORIZED")

    @staticmethod
    def forbidden(message: str = "Forbidden"):
        """
        Return 403 forbidden response.

        Args:
            message: Error message

        Returns:
            Flask response tuple (jsonify, 403)
        """
        return APIResponse.error(message=message, status_code=403, error_code="FORBIDDEN")

    @staticmethod
    def internal_error(message: str = "Internal server error", details: Any = None):
        """
        Return 500 internal error response.

        Args:
            message: Error message
            details: Error details (only in debug mode)

        Returns:
            Flask response tuple (jsonify, 500)
        """
        return APIResponse.error(message=message, status_code=500, error_code="INTERNAL_ERROR", details=details)

    @staticmethod
    def paginated(items: list, total: int, limit: int, offset: int, message: Optional[str] = None):
        """
        Return paginated response.

        Args:
            items: List of items for current page
            total: Total number of items
            limit: Items per page
            offset: Current offset
            message: Optional message

        Returns:
            Flask response tuple (jsonify, 200)
        """
        meta = {
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "count": len(items),
                "has_more": offset + len(items) < total,
            }
        }

        return APIResponse.success(data=items, message=message, meta=meta)


# Convenience aliases
success = APIResponse.success
error = APIResponse.error
validation_error = APIResponse.validation_error
not_found = APIResponse.not_found
unauthorized = APIResponse.unauthorized
forbidden = APIResponse.forbidden
internal_error = APIResponse.internal_error
paginated = APIResponse.paginated
