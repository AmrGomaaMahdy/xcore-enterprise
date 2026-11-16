"""Session-based authentication for the same-origin SPA (HttpOnly session cookie + CSRF token)."""

import logging

from django.contrib.auth import authenticate, login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import audit

from .serializers import LoginSerializer, MeSerializer

log = logging.getLogger(__name__)
GENERIC_FAILURE = "Invalid username or password."


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the CSRF cookie so the sign-in form can post safely."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses={200: MeSerializer})
    def post(self, request):
        # DRF only checks CSRF for authenticated sessions — enforce it for sign-in too (login CSRF).
        SessionAuthentication().enforce_csrf(request)
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request=request, **data.validated_data)
        if getattr(request, "axes_locked_out", False):
            return Response(
                {"error": {"code": "locked_out", "message": "Too many failed attempts. Try again in a few minutes."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user is None or not user.is_active:
            log.warning("Failed sign-in for %s", data.validated_data["username"][:60])
            return Response({"error": {"code": "invalid_credentials", "message": GENERIC_FAILURE}}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)  # rotates the session key (prevents session fixation)
        audit.record(user, "login", "user", user.pk, "Signed in")
        return Response(MeSerializer(user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        audit.record(request.user, "logout", "user", request.user.pk, "Signed out")
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MeSerializer})
    def get(self, request):
        return Response(MeSerializer(request.user).data)
