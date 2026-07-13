import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

logger = logging.getLogger(__name__)


def send_security_email(recipient: str, subject: str, body: str) -> bool:
    """Send security mail when SMTP is configured; otherwise log a safe notice."""
    if not settings.SMTP_HOST or not settings.SMTP_FROM:
        logger.info("Security email queued for %s: %s", recipient, subject)
        return False
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USERNAME:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            smtp.send_message(message)
        return True
    except OSError:
        logger.exception("Unable to send security email")
        return False
