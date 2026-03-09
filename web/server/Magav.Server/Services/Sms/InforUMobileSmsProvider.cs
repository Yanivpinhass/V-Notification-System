using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Magav.Server.Services.Sms;

/// <summary>
/// SMS provider implementation for InforUMobile (inforu.co.il).
/// Uses the XML HTTP POST API at /SendMessageXml.ashx.
/// </summary>
public class InforUMobileSmsProvider : ISmsProvider
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<InforUMobileSmsProvider> _logger;
    private readonly string _userName;
    private readonly string _password;
    private readonly string _senderName;

    public InforUMobileSmsProvider(
        HttpClient httpClient,
        IConfiguration config,
        ILogger<InforUMobileSmsProvider> logger)
    {
        _httpClient = httpClient;
        _logger = logger;

        _userName = config["InforUMobile:UserName"]
            ?? throw new InvalidOperationException("InforUMobile:UserName not configured");
        _password = config["InforUMobile:Password"]
            ?? throw new InvalidOperationException("InforUMobile:Password not configured");
        _senderName = config["InforUMobile:SenderName"]
            ?? throw new InvalidOperationException("InforUMobile:SenderName not configured");
    }

    public async Task<SmsResult> SendSmsAsync(string phoneNumber, string message)
    {
        try
        {
            var xml = BuildXmlPayload(phoneNumber, message);
            var encodedXml = Uri.EscapeDataString(xml);

            var response = await _httpClient.PostAsync(
                $"SendMessageXml.ashx?InforuXML={encodedXml}",
                null);

            var responseBody = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("InforUMobile HTTP error {StatusCode}: {Body}",
                    response.StatusCode, responseBody);
                return new SmsResult { Success = false, Error = "שגיאת שליחה" };
            }

            return ParseResponse(responseBody);
        }
        catch (TaskCanceledException)
        {
            _logger.LogError("InforUMobile request timed out for phone {Phone}", MaskPhone(phoneNumber));
            return new SmsResult { Success = false, Error = "זמן השליחה חרג" };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "InforUMobile network error for phone {Phone}", MaskPhone(phoneNumber));
            return new SmsResult { Success = false, Error = "שגיאת רשת" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "InforUMobile unexpected error for phone {Phone}", MaskPhone(phoneNumber));
            return new SmsResult { Success = false, Error = "שגיאה לא צפויה" };
        }
    }

    private string BuildXmlPayload(string phoneNumber, string message)
    {
        var doc = new XElement("Inforu",
            new XElement("User",
                new XElement("Username", _userName),
                new XElement("Password", _password)
            ),
            new XElement("Content",
                new XAttribute("Type", "sms"),
                new XElement("Message", message)
            ),
            new XElement("Recipients",
                new XElement("PhoneNumber", phoneNumber)
            ),
            new XElement("Settings",
                new XElement("Sender", _senderName)
            )
        );

        return doc.ToString(SaveOptions.DisableFormatting);
    }

    private SmsResult ParseResponse(string responseBody)
    {
        try
        {
            // InforUMobile returns a numeric status code:
            // 1 = OK, -1 = Failed, -2 = Bad credentials,
            // -6 = No recipients, -9 = No message, -13 = Quota exceeded
            if (int.TryParse(responseBody.Trim(), out var statusCode))
            {
                if (statusCode == 1)
                    return new SmsResult { Success = true };

                var errorMessage = statusCode switch
                {
                    -2 => "שגיאת אימות",
                    -6 => "מספר טלפון לא תקין",
                    -9 => "הודעה ריקה",
                    -13 => "חריגה ממכסת הודעות",
                    _ => "שגיאת שליחה"
                };

                _logger.LogWarning("InforUMobile returned status {StatusCode}", statusCode);
                return new SmsResult { Success = false, Error = errorMessage };
            }

            // Try to parse as XML response
            var doc = XDocument.Parse(responseBody);
            var status = doc.Root?.Element("Status")?.Value;
            if (status == "1" || status?.Equals("OK", StringComparison.OrdinalIgnoreCase) == true)
                return new SmsResult { Success = true };

            _logger.LogWarning("InforUMobile unexpected response: {Body}", responseBody);
            return new SmsResult { Success = false, Error = "שגיאת שליחה" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse InforUMobile response: {Body}", responseBody);
            return new SmsResult { Success = false, Error = "שגיאת שליחה" };
        }
    }

    private static string MaskPhone(string phone)
    {
        if (string.IsNullOrEmpty(phone) || phone.Length < 4)
            return "***";
        return string.Concat("***", phone.AsSpan(phone.Length - 4));
    }
}
