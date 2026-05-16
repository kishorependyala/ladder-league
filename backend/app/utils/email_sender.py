import os
import smtplib
from email.mime.text import MIMEText


def send_email(to_address: str, subject: str, body: str) -> bool:
    """Send email via SMTP. Returns True on success, False on failure."""
    host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    port = int(os.environ.get('SMTP_PORT', '587'))
    user = os.environ.get('SMTP_USER', '')
    password = os.environ.get('SMTP_PASS', '')
    from_addr = os.environ.get('FROM_EMAIL', user)

    if not user or not password:
        print(f"[EMAIL] SMTP not configured. Would send to {to_address}: {subject}\n{body}")
        return False

    msg = MIMEText(body, 'plain')
    msg['Subject'] = subject
    msg['From'] = from_addr
    msg['To'] = to_address

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(from_addr, [to_address], msg.as_string())
        print(f"[EMAIL] Sent to {to_address}: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send to {to_address}: {e}")
        return False
