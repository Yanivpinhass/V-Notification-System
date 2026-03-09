using Magav.Common.Logger;
using brevo_csharp.Api;
using brevo_csharp.Model;
using Task = System.Threading.Tasks.Task;

namespace Magav.Common.Email;

internal class BrevoEmailNotifier
{
    public async Task SendEmail(
        SendSmtpEmailSender? senderEmail,
        List<SendSmtpEmailTo>? recipientsEmails,
        string subject,
        string content,
        string apiKey,
        List<SendSmtpEmailAttachment>? attachments = null)
    {
        if (senderEmail == null)
        {
            Log.WriteError("Sender information is required.");
            return;
        }

        if (recipientsEmails == null || !recipientsEmails.Any())
        {
            Log.WriteError("At least one recipient is required.");
            return;
        }

        // Configure API key authorization
        brevo_csharp.Client.Configuration.Default.ApiKey.Clear();
        brevo_csharp.Client.Configuration.Default.ApiKey.Add("api-key", apiKey);

        var apiInstance = new TransactionalEmailsApi();

        var sendSmtpEmail = new SendSmtpEmail
        {
            Sender = senderEmail,
            To = recipientsEmails,
            Subject = subject,
            TextContent = content,
            Attachment = attachments
        };

        try
        {
            var result = await apiInstance.SendTransacEmailAsync(sendSmtpEmail);
            Log.WriteError($"Email sent successfully! Message ID: {result.MessageId}");
        }
        catch (Exception e)
        {
            Log.WriteError($"Exception when sending email:",e );
           // throw; // Re-throw the exception to allow the caller to handle it
        }
    }
}