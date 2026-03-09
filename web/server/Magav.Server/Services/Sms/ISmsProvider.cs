namespace Magav.Server.Services.Sms;

public interface ISmsProvider
{
    Task<SmsResult> SendSmsAsync(string phoneNumber, string message);
}

public class SmsResult
{
    public bool Success { get; set; }
    public string? Error { get; set; }
}
