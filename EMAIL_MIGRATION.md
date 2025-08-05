# Email Provider Migration

## Switching from SendGrid to Resend

This project has been updated to use Resend instead of SendGrid for email delivery. This change provides better pricing (3,000 free emails/month vs SendGrid's limited free tier) and a more modern API.

### Required Configuration Changes

#### Environment Variables

- **Old**: `SENDGRID_API_KEY="your_sendgrid_api_key"`
- **New**: `RESEND_API_KEY="your_resend_api_key"`

#### Getting a Resend API Key

1. Visit [https://resend.com](https://resend.com)
2. Sign up for a free account
3. Go to [API Keys](https://resend.com/api-keys)
4. Create a new API key
5. Update your `Secrets.toml` file with the new `RESEND_API_KEY`

#### Setting Up Domain Approval for Resend

To send emails from `CaLANdar <lewis+calandar@updates.oaten.name>`, you must verify and approve the `updates.oaten.name` domain in Resend:

1. Go to [Domains](https://resend.com/domains) in your Resend dashboard.
2. Click **Add Domain** and enter `updates.oaten.name`.
3. Follow the instructions to add the required DNS records (SPF, DKIM, and DMARC) to your DNS provider for `updates.oaten.name`.
4. Wait for Resend to verify your domain. This may take a few minutes to a few hours depending on DNS propagation.
5. Once verified, you can send emails from any address at `updates.oaten.name`.

> **Note:** The application now sends emails from:
>
>     CaLANdar <lewis+calandar@updates.oaten.name>
>
> Make sure your domain is approved, or emails may be rejected or marked as spam.

### What Changed

- Dependency: `sendgrid` → `resend-rs`
- API calls use Resend's modern REST API
- Same email functionality (verification emails, event invitations)
- Same HTML templating with Tera
- **Sender address is now:** `CaLANdar <lewis+calandar@updates.oaten.name>`

### Benefits

- **Free tier**: 3,000 emails/month (vs SendGrid's more limited free plan)
- **Better deliverability**: Modern infrastructure designed for reliability
- **Simpler API**: Cleaner, more intuitive interface
- **Official Rust support**: Well-maintained official Rust SDK

### No Functional Changes

The email functionality remains exactly the same:

- Email verification for login
- Event invitation emails
- HTML templates using Tera
- **Sender address is now:** `CaLANdar <lewis+calandar@updates.oaten.name>`

Users will see no difference in the emails they receive, but you must ensure your domain is approved in Resend for successful delivery.
