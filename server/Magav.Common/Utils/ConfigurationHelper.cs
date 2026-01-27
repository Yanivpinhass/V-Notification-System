using Magav.Common.Encryption;
using Microsoft.Extensions.Configuration;

namespace Magav.Common
{
    public static class ConfigurationHelper
    {
        private const string ServerClearNameKey = "ServerClearName";
        private const string SendEmailKey = "SendEmail";
        private const string VersionModeKey = "VersionMode";

        private const string DatabaseConnectionConfigKey = "DatabaseConnectionName";
   
        private static string? _databaseConnectionString;
   
        public static IConfiguration Configuration { get; }

        static ConfigurationHelper()
        {
            Configuration = new ConfigurationBuilder()
                .Add(new EncryptedConnectionStringsSource { Path = "appsettings.json", ReloadOnChange = true })
                .Build();
        }

        public static string GetDbConnectionString()
        {
            if (string.IsNullOrEmpty(_databaseConnectionString))
            {
                _databaseConnectionString = GetConnectionString(DatabaseConnectionConfigKey);
            }

            if (string.IsNullOrEmpty(_databaseConnectionString))
            {
                throw new Exception($"Database connection string key: {DatabaseConnectionConfigKey} in configuration is not set");
            }
            return _databaseConnectionString;
        }

        public static string GetServerClearName()
        {
            return RetrieveAppSettingsValue(ServerClearNameKey) ?? "Server";
        }

        public static bool GetSendEmail()
        {
            string? sendEmail = RetrieveAppSettingsValue(SendEmailKey);
            return sendEmail != null && sendEmail.ToLower() == "true";
        }

        private static string? GetConnectionString(string selectedConnectionStringKey)
        {
            string? databaseName = RetrieveAppSettingsValue(selectedConnectionStringKey);
            
            if (databaseName == null)
            {
                return null;
            }

            return Configuration.GetConnectionString(databaseName);
        }

        private static string? RetrieveAppSettingsValue(string keyName)
        {
            return !string.IsNullOrEmpty(keyName)
                ? Configuration[keyName]
                : null;
        }

       
    }
}
