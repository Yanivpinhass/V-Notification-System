namespace Magav.Common
{
    public static class MagavConstants
    {
        public static readonly string ServerName = ConfigurationHelper.GetServerClearName();
        public static readonly bool SendEmail = ConfigurationHelper.GetSendEmail();
        public const string PasswordKey = "Magav2019097748";

        public static class ReminderTypes
        {
            public const string SameDay = "SameDay";
            public const string Advance = "Advance";
            public const string LocationUpdate = "LocationUpdate";
            public const string Manual = "Manual";
        }

        public static class SmsStatuses
        {
            public const string Success = "Success";
            public const string Fail = "Fail";
        }
    }
}
