from django.contrib.auth import views
from django.urls import path
from django.views.generic import TemplateView

app_name = "auth"

urlpatterns = [
    path(
        "success/",
        TemplateView.as_view(template_name="registration/success.html"),
        name="success",
    ),
    path(
        "login/",
        views.LoginView.as_view(),
        name="login",
    ),
    path(
        "logout/",
        TemplateView.as_view(template_name="registration/custom_logged_out.html"),
        name="logout",
    ),
    path(
        "password_change/",
        views.PasswordChangeView.as_view(),
        name="password_change",
    ),
    path(
        "password_change/done/",
        views.PasswordChangeDoneView.as_view(),
        name="password_change_done",
    ),
    path(
        "password_reset/",
        views.PasswordResetView.as_view(),
        name="password_reset",
    ),
    path(
        "password_reset/done/",
        views.PasswordResetDoneView.as_view(),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        views.PasswordResetConfirmView.as_view(),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        views.PasswordResetCompleteView.as_view(
            template_name="admin/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
]
