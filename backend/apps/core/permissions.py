"""Role-based access: Viewer (read) · Editor (maintain) · Approver (maker-checker decisions) · Admin."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


def can_edit(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, "role", "") in {"editor", "approver", "admin"}))


def can_approve(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, "role", "") in {"approver", "admin"}))


class IsEditorOrReadOnly(BasePermission):
    message = "Your role can view but not change this content."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or can_edit(request.user)


class IsApprover(BasePermission):
    message = "Only approvers can decide on approval requests."

    def has_permission(self, request, view) -> bool:
        return can_approve(request.user)


class ReadOnly(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.method in SAFE_METHODS)
