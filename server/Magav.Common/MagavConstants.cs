namespace Magav.Common
{
    public static class MagavConstants
    {
        public static readonly string ServerName = ConfigurationHelper.GetServerClearName();
        public static readonly bool SendEmail = ConfigurationHelper.GetSendEmail();
        public const string PasswordKey = "Magav2019097748";
    }
}
