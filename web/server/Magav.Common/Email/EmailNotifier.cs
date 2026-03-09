using brevo_csharp.Model;
using Task = System.Threading.Tasks.Task;

namespace Magav.Common.Email
{
    public static class EmailNotifier
    {
        // API key must be configured via environment variable or appsettings.json
        private static string? _apiKey;
        private static SendSmtpEmailSender? _senderEmail;
        private static List<SendSmtpEmailTo>? _recipientsEmails;

        public static void Configure(string apiKey, string senderName, string senderEmail, List<(string email, string name)> recipients)
        {
            _apiKey = apiKey;
            _senderEmail = new SendSmtpEmailSender(senderName, senderEmail);
            _recipientsEmails = recipients.Select(r => new SendSmtpEmailTo(r.email, r.name)).ToList();
        }

        public static async Task SendEmail(string subject, string content, List<DataFile>? attachments = null)
        {
            if (!MagavConstants.SendEmail)
            {
                return;
            }

            if (string.IsNullOrEmpty(_apiKey) || _senderEmail == null || _recipientsEmails == null)
            {
                throw new InvalidOperationException("EmailNotifier not configured. Call Configure() first.");
            }

            var subjectWithServerName = $"{MagavConstants.ServerName} - {subject}";
            var emailSender = new BrevoEmailNotifier();
            await emailSender.SendEmail(_senderEmail, _recipientsEmails, subjectWithServerName, content, _apiKey,
                attachments?.Select(file => new SendSmtpEmailAttachment(file.Name, file.File)).ToList());
        }
    }
}
