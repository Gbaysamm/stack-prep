"""Sending email: today only the password-reset code.

SMTP settings come from the environment (`SMTP_*`, `MAIL_FROM`). With no host set nothing is
sent; outside production the message is written to the log instead, so the flow can be used
locally, and in production a warning is logged without the message (it holds a code).
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import get_settings

_log = logging.getLogger(__name__)


def _send_now(message: EmailMessage) -> None:
    settings = get_settings()
    context = ssl.create_default_context()
    if settings.smtp_ssl:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            settings.smtp_host, settings.smtp_port, context=context, timeout=20
        )
    else:
        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20)
    with server:
        if not settings.smtp_ssl:
            server.starttls(context=context)
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


async def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email; False when it could not be sent (the reason is logged)."""
    settings = get_settings()
    if not settings.smtp_host:
        if settings.app_env == "production":
            _log.warning("SMTP_HOST is not set; an email to %s was not sent", to)
        else:
            _log.warning("No SMTP_HOST, so not sent. To %s, %r:\n%s", to, subject, body)
        return False
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        await asyncio.to_thread(_send_now, message)
    except (OSError, smtplib.SMTPException):
        _log.exception("Sending an email to %s failed", to)
        return False
    return True
