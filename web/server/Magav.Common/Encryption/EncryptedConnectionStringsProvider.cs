using System.Data.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;

namespace Magav.Common.Encryption
{
    public class EncryptedConnectionStringsProvider : IConfigurationProvider
    {
        private readonly IConfigurationProvider _inner;

        public EncryptedConnectionStringsProvider(IConfigurationProvider inner)
        {
            _inner = inner;
        }

        public IEnumerable<string> GetChildKeys(IEnumerable<string> earlierKeys, string parentPath)
            => _inner.GetChildKeys(earlierKeys, parentPath);

        public IChangeToken GetReloadToken()
            => _inner.GetReloadToken();

        public void Load()
            => _inner.Load();

        public void Set(string key, string value)
            => _inner.Set(key, value);

        public bool TryGet(string key, out string value)
        {
            var result = _inner.TryGet(key, out value);
            if (result && key.StartsWith("ConnectionStrings:"))
            {
                value = DecryptPassword(value);
            }


            return result;
        }

        private static string DecryptPassword(string encryptedConnectionString)
        {
            var connSb = new DbConnectionStringBuilder { ConnectionString = encryptedConnectionString };
            if (!connSb.ConnectionString.ToLower().Contains("Integrated Security=True".ToLower()))
            {
                var pass = connSb["password"].ToString();
                var result = EncryptionHelper.DecryptDataWithKey(pass, MagavConstants.PasswordKey);
                connSb["password"] = result;
            }

            return connSb.ConnectionString;
        }
    }
}
