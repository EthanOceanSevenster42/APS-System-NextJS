"""
Microsoft Graph API Email Backend for Django
Sends emails using Microsoft Graph API instead of SMTP
"""
import base64
import time
import logging
import json
import mimetypes
import os
from django.core.mail.backends.base import BaseEmailBackend
from django.conf import settings
import requests

logger = logging.getLogger(__name__)

# Graph API inline attachment limit: 3MB (4MB request limit with base64 overhead)
LARGE_ATTACHMENT_THRESHOLD = 3 * 1024 * 1024  # 3MB in bytes
UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024  # 4MB chunks for upload sessions


class GraphEmailBackend(BaseEmailBackend):
    """
    Email backend that uses Microsoft Graph API to send emails.
    """

    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.client_id = getattr(settings, 'GRAPH_CLIENT_ID', None)
        self.client_secret = getattr(settings, 'GRAPH_CLIENT_SECRET', None)
        self.tenant_id = getattr(settings, 'GRAPH_TENANT_ID', None)
        self.from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'info@eclick.co.za')
        self.access_token = None

    def get_access_token(self):
        """
        Obtain an access token from Microsoft Identity Platform using client credentials flow.
        """
        if not all([self.client_id, self.client_secret, self.tenant_id]):
            logger.error("Microsoft Graph API credentials are not properly configured.")
            return None

        token_url = f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0/token"

        token_data = {
            'grant_type': 'client_credentials',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'scope': 'https://graph.microsoft.com/.default'
        }

        try:
            response = requests.post(token_url, data=token_data, timeout=30)
            response.raise_for_status()
            token_response = response.json()
            self.access_token = token_response.get('access_token')
            logger.info("Successfully obtained Microsoft Graph API access token")
            return self.access_token
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to obtain access token: {str(e)}")
            if not self.fail_silently:
                raise
            return None

    def send_messages(self, email_messages):
        """
        Send one or more EmailMessage objects and return the number of sent messages.
        """
        if not email_messages:
            return 0

        # Get access token
        if not self.access_token:
            self.get_access_token()

        if not self.access_token:
            logger.error("Cannot send emails without access token")
            return 0

        num_sent = 0
        for message in email_messages:
            try:
                if self._send_message(message):
                    num_sent += 1
            except Exception as e:
                logger.error(f"Failed to send email: {str(e)}")
                if not self.fail_silently:
                    raise

        return num_sent

    def _build_message_payload(self, message, content_type, content):
        """Build the base Graph API message payload (no attachments)."""
        payload = {
            "subject": message.subject,
            "body": {
                "contentType": content_type,
                "content": content
            },
            "toRecipients": [
                {"emailAddress": {"address": recipient}} for recipient in message.to
            ],
            "from": {
                "emailAddress": {
                    "address": self.from_email
                }
            }
        }
        if message.cc:
            payload["ccRecipients"] = [
                {"emailAddress": {"address": recipient}} for recipient in message.cc
            ]
        if message.bcc:
            payload["bccRecipients"] = [
                {"emailAddress": {"address": recipient}} for recipient in message.bcc
            ]
        return payload

    def _get_attachments(self, message):
        """
        Return list of (filename, bytes_content, mimetype) for all attachments.
        """
        result = []
        for attachment in message.attachments:
            if isinstance(attachment, tuple):
                filename, content, mimetype = attachment
                if isinstance(content, str):
                    content = content.encode('utf-8')
                result.append((filename, content, mimetype or "application/octet-stream"))
        return result

    def _send_message(self, message):
        """
        Send a single EmailMessage using Microsoft Graph API.
        Uses inline attachments for small emails, upload sessions for large ones.
        """
        content_type = "Text"
        content = message.body

        if hasattr(message, 'alternatives') and message.alternatives:
            for alternative_content, alternative_type in message.alternatives:
                if alternative_type == 'text/html':
                    content_type = "HTML"
                    content = alternative_content
                    break
        elif message.content_subtype == 'html':
            content_type = "HTML"

        attachments = self._get_attachments(message) if message.attachments else []
        total_size = sum(len(c) for _, c, _ in attachments)

        if total_size >= LARGE_ATTACHMENT_THRESHOLD:
            # Draft path has no inline-image support — send them as normal attachments
            extra = [(f, c, m) for _, f, c, m in getattr(message, 'graph_inline_images', [])]
            return self._send_via_draft(message, content_type, content, attachments + extra)
        else:
            return self._send_inline(message, content_type, content, attachments)

    def _send_inline(self, message, content_type, content, attachments):
        """Send email with all attachments inline (for small emails < 3MB total)."""
        email_data = {
            "message": self._build_message_payload(message, content_type, content),
            "saveToSentItems": "true"
        }

        # Optional inline images (e.g. picture signatures): list of
        # (content_id, filename, bytes, mimetype) tuples on the message.
        inline_images = getattr(message, 'graph_inline_images', [])
        if attachments or inline_images:
            email_data["message"]["attachments"] = [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": filename,
                    "contentType": mimetype,
                    "contentBytes": base64.b64encode(file_content).decode('utf-8')
                }
                for filename, file_content, mimetype in attachments
            ] + [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": filename,
                    "contentType": mimetype,
                    "isInline": True,
                    "contentId": cid,
                    "contentBytes": base64.b64encode(file_content).decode('utf-8')
                }
                for cid, filename, file_content, mimetype in inline_images
            ]

        graph_url = f"https://graph.microsoft.com/v1.0/users/{self.from_email}/sendMail"
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }

        response = self._graph_request('POST', graph_url, headers=headers, json=email_data, timeout=60)

        if response.status_code == 202:
            logger.info(f"Successfully sent email (inline) to {', '.join(message.to)}")
            return True
        else:
            self._raise_graph_error(response, message)

    def _send_via_draft(self, message, content_type, content, attachments):
        """
        Send email with large attachments using draft + upload session approach.
        Required when total attachment size >= 3MB.
        """
        headers = {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json'
        }
        base_url = f"https://graph.microsoft.com/v1.0/users/{self.from_email}"

        # Step 1: Create draft
        draft_payload = self._build_message_payload(message, content_type, content)
        response = self._graph_request(
            'POST', f"{base_url}/messages",
            headers=headers, json=draft_payload, timeout=30
        )
        if response.status_code not in (200, 201):
            self._raise_graph_error(response, message, context="creating draft")

        message_id = response.json()['id']
        logger.info(f"Created draft message id={message_id}")

        # Step 2: Attach each file
        for filename, file_content, mimetype in attachments:
            if len(file_content) < LARGE_ATTACHMENT_THRESHOLD:
                # Small enough for inline attachment on draft
                attach_payload = {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    "name": filename,
                    "contentType": mimetype,
                    "contentBytes": base64.b64encode(file_content).decode('utf-8')
                }
                r = self._graph_request(
                    'POST', f"{base_url}/messages/{message_id}/attachments",
                    headers=headers, json=attach_payload, timeout=30
                )
                if r.status_code not in (200, 201):
                    self._raise_graph_error(r, message, context=f"attaching {filename}")
                logger.info(f"Attached {filename} inline to draft")
            else:
                # Use upload session for large files
                self._upload_large_attachment(
                    base_url, message_id, filename, file_content, mimetype, headers
                )

        # Step 3: Send the draft
        response = self._graph_request(
            'POST', f"{base_url}/messages/{message_id}/send",
            headers=headers, timeout=60
        )
        if response.status_code == 202:
            logger.info(f"Successfully sent email (draft+upload) to {', '.join(message.to)}")
            return True
        else:
            self._raise_graph_error(response, message, context="sending draft")

    def _upload_large_attachment(self, base_url, message_id, filename, file_content, mimetype, headers):
        """Upload a large attachment using a Graph API upload session."""
        file_size = len(file_content)

        # Create upload session
        session_payload = {
            "AttachmentItem": {
                "attachmentType": "file",
                "name": filename,
                "size": file_size,
                "contentType": mimetype
            }
        }
        r = self._graph_request(
            'POST', f"{base_url}/messages/{message_id}/attachments/createUploadSession",
            headers=headers, json=session_payload, timeout=30
        )
        if r.status_code not in (200, 201):
            raise requests.exceptions.HTTPError(
                f"Failed to create upload session for {filename}: {r.status_code} {r.text[:300]}",
                response=r
            )

        upload_url = r.json()['uploadUrl']
        logger.info(f"Upload session created for {filename} ({file_size} bytes)")

        # Upload in chunks
        offset = 0
        while offset < file_size:
            chunk = file_content[offset:offset + UPLOAD_CHUNK_SIZE]
            chunk_len = len(chunk)
            end = offset + chunk_len - 1

            upload_headers = {
                'Content-Type': 'application/octet-stream',
                'Content-Length': str(chunk_len),
                'Content-Range': f'bytes {offset}-{end}/{file_size}'
            }
            r = self._graph_request('PUT', upload_url, headers=upload_headers, data=chunk, timeout=120)

            if r.status_code not in (200, 201, 202):
                raise requests.exceptions.HTTPError(
                    f"Chunk upload failed for {filename} at offset {offset}: {r.status_code} {r.text[:300]}",
                    response=r
                )
            offset += chunk_len
            logger.info(f"Uploaded {filename}: {min(offset, file_size)}/{file_size} bytes")

        logger.info(f"Large attachment {filename} uploaded successfully")

    def _graph_request(self, method, url, **kwargs):
        """Graph HTTP call that retries on throttling (429) and transient 503s,
        honouring the Retry-After header so a short IncomingBytes/rate throttle
        recovers on its own instead of failing the user's send."""
        attempts = 0
        while True:
            resp = requests.request(method, url, **kwargs)
            if resp.status_code not in (429, 503) or attempts >= 3:
                return resp
            ra = resp.headers.get('Retry-After')
            try:
                wait = int(ra) if ra else 0
            except (TypeError, ValueError):
                wait = 0
            if wait <= 0:
                wait = 5 * (2 ** attempts)
            wait = min(wait, 20)
            logger.warning("[GRAPH] throttled HTTP %s on %s; waiting %ss then retry (%s)",
                           resp.status_code, url.rsplit('/', 1)[-1], wait, attempts + 1)
            time.sleep(wait)
            attempts += 1

    def _raise_graph_error(self, response, message, context=""):
        """Log and raise a Graph API error."""
        error_body = response.text[:1000]
        ctx = f" [{context}]" if context else ""
        logger.error(f"[GRAPH SEND FAIL]{ctx} HTTP {response.status_code} for TO={message.to}")
        logger.error(f"[GRAPH SEND FAIL] Response: {error_body}")
        err_code = 'Unknown'
        err_msg = error_body
        try:
            err_json = response.json()
            err_code = err_json.get('error', {}).get('code', 'Unknown')
            err_msg = err_json.get('error', {}).get('message', error_body)
            logger.error(f"[GRAPH SEND FAIL] Error code: {err_code}, message: {err_msg}")
        except Exception:
            pass
        if response.status_code == 429:
            raise requests.exceptions.HTTPError(
                "Microsoft is rate-limiting email sends right now (too much data in a "
                "short time). Please wait a few minutes and send again.",
                response=response
            )
        raise requests.exceptions.HTTPError(
            f"Graph API error {response.status_code} ({err_code}): {err_msg}",
            response=response
        )
