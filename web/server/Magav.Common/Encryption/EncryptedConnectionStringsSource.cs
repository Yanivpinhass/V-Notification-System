using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;

namespace Magav.Common.Encryption
{
    public class EncryptedConnectionStringsSource : JsonConfigurationSource
    {
        public override IConfigurationProvider Build(IConfigurationBuilder builder)
        {
            var provider = base.Build(builder);
            return new EncryptedConnectionStringsProvider(provider);
        }
    }
}
