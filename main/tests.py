from unittest.mock import patch

from django.test import Client, TestCase
from django.test.utils import override_settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


class ForgotPasswordTests(TestCase):
    def test_forgot_password_accepts_post_without_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post('/forgot-password/', {'email': 'someone@example.com'})

        self.assertEqual(response.status_code, 302)

    @override_settings(SITE_URL='https://portal.example.com')
    @patch('django.core.mail.send_mail')
    def test_forgot_password_uses_frontend_site_url_for_reset_link(self, mock_send_mail):
        User.objects.create_user(
            username='developer-user',
            email='ethansevenster5@gmail.com',
            password='test-password-123',
        )

        response = self.client.post('/forgot-password/', {'email': 'ethansevenster5@gmail.com'})

        self.assertEqual(response.status_code, 302)
        self.assertTrue(mock_send_mail.called)

        html_message = mock_send_mail.call_args.kwargs['html_message']
        self.assertIn('https://portal.example.com/reset-password/', html_message)
        self.assertNotIn('http://testserver/reset-password/', html_message)


class ResetPasswordConfirmTests(TestCase):
    """The Next.js frontend proxies here asking for JSON; a rejected reset must
    not come back looking like a success."""

    JSON_HEADERS = {'HTTP_ACCEPT': 'application/json'}

    def setUp(self):
        self.user = User.objects.create_user(
            username='reset-user',
            email='reset-user@example.com',
            password='original-password-123',
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def _url(self, uid=None, token=None):
        return '/reset-password/{}/{}/'.format(uid or self.uid, token or self.token)

    def test_valid_reset_returns_json_success_and_changes_password(self):
        response = self.client.post(
            self._url(),
            {'new_password': 'Fresh-Passw0rd!', 'confirm_password': 'Fresh-Passw0rd!'},
            **self.JSON_HEADERS
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('Fresh-Passw0rd!'))

    def test_expired_token_reports_failure_not_success(self):
        stale_token = default_token_generator.make_token(self.user)
        self.user.set_password('changed-since-token-was-issued')
        self.user.save()

        response = self.client.post(
            self._url(token=stale_token),
            {'new_password': 'Fresh-Passw0rd!', 'confirm_password': 'Fresh-Passw0rd!'},
            **self.JSON_HEADERS
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertFalse(payload['success'])
        self.assertTrue(payload['token_invalid'])

        self.user.refresh_from_db()
        self.assertFalse(self.user.check_password('Fresh-Passw0rd!'))

    def test_mismatched_passwords_report_failure_not_success(self):
        response = self.client.post(
            self._url(),
            {'new_password': 'Fresh-Passw0rd!', 'confirm_password': 'something-else-1!'},
            **self.JSON_HEADERS
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('original-password-123'))

    def test_weak_password_is_rejected_by_django_validators(self):
        response = self.client.post(
            self._url(),
            {'new_password': 'password', 'confirm_password': 'password'},
            **self.JSON_HEADERS
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['success'])

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('original-password-123'))

    def test_browser_request_still_gets_the_html_flow(self):
        response = self.client.get(self._url())

        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response['Content-Type'])
