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
            public const string WeekdayAdvance = "WeekdayAdvance";
            public const string AdminAdvance = "AdminAdvance";
        }

        public static class ShiftTypes
        {
            public const string Operational = "Operational";
            public const string Administrative = "Administrative";
        }

        public static class LocationTypes
        {
            public const string Vehicle = "Vehicle";
            public const string General = "General";
        }

        // AppSettings keys (administrative-shifts template roles — D5). NOT part of the parity-lint
        // value-sets, but MUST match the Android DatabaseInitializer.kt key literals exactly.
        public static class AppSettingsKeys
        {
            public const string AdminAssignmentTemplateId = "admin_assignment_template_id";
            public const string AdminTodayTemplateId = "admin_today_template_id";
        }

        public static class SmsStatuses
        {
            public const string Success = "Success";
            public const string Fail = "Fail";
            // Handed to the radio, no delivery/sent confirmation inside the wait window — most
            // likely delivered. Written by the ANDROID write-ahead send path (the .NET scheduler
            // still logs post-send: accepted divergence, see tools/parity.md). [dup-sms plan]
            public const string Dispatched = "Dispatched";
        }

        public static class DayGroups
        {
            public const string SunThu = "SunThu";
            public const string Fri = "Fri";
            public const string Sat = "Sat";
        }
    }
}
