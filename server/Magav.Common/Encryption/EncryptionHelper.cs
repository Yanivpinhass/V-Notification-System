using System.Security.Cryptography;
using System.Text;

namespace Magav.Common.Encryption
{
    /// <summary>
    /// Common encryptions functions
    /// </summary>
    public static class EncryptionHelper
    {
        #region Encrypt/Decrypt with password

        // overload with string data instead of byte[] data
        // encrypt the inputed data string using AES/Rijndael cryptography algorithm
        // and the inputed password. output an encrypted byte array
        public static string EncryptDataWithKey(string data, string password)
        {
            // input verification
            if (data == null)
            {
                throw new ArgumentNullException(nameof(data));
            }

            if (password == null)
            {
                throw new ArgumentNullException(nameof(password));
            }

            //Validator.ValidateStringNotNullOrEmpty
            if (data.Length < 1)
            {
                return "";
            }

            byte[] bdata = Encoding.UTF8.GetBytes(data);
            return Convert.ToBase64String(EncryptBinaryDataWithKey(bdata, password));
        }

        // decrypt(using AES/Rijndael cryptography algorithm)the inputed data using the inputed password
        // and output a decrypted byte array
        public static string DecryptDataWithKey(string encryptedData, string password)
        {
            byte[] encryptedDataAsByteArray = Convert.FromBase64String(encryptedData);

            var bytes = DecryptBinaryDataWithKey(encryptedDataAsByteArray, password);
            return Encoding.UTF8.GetString(bytes);
        }

        // encrypt the inputed data byte[] using Rijndael(AES) cryptography algorithm
        // and the inputed password. output an encrypted byte array
        private static byte[] EncryptBinaryDataWithKey(byte[] bdata, string password)
        {
            // input verification
            if (bdata == null)
            {
                throw new ArgumentNullException(nameof(bdata));
            }

            if (password == null)
            {
                throw new ArgumentNullException(nameof(password));
            }

            if (bdata.Length < 1)
            {
                return bdata;
            }

            // Create the salt
            RandomNumberGenerator randNumGen = RandomNumberGenerator.Create();
            var salt = new byte[16];
            randNumGen.GetBytes(salt);

            // Generate the key from the password and salt
            var passBytes = new Rfc2898DeriveBytes(password, salt);
            //PasswordDeriveBytes passBytes = new PasswordDeriveBytes(password, salt);
            byte[] key = passBytes.GetBytes(16);

            // Create and configure the cryptography algorithm
            using (Rijndael cryptoAlg = Rijndael.Create())
            {
                cryptoAlg.Key = key;

                // Create the output stream
                using (var dataStream = new MemoryStream())
                {
                    // Write the salt and IV to the output stream unencrypted
                    dataStream.Write(salt, 0, salt.Length);
                    dataStream.Write(cryptoAlg.IV, 0, cryptoAlg.IV.Length);

                    // Create the CryptoStream
                    using (var cryptoStream =
                        new CryptoStream(dataStream, cryptoAlg.CreateEncryptor(), CryptoStreamMode.Write))
                    {
                        // Write the data to the CryptoStream
                        cryptoStream.Write(bdata, 0, bdata.Length);
                    }

                    return dataStream.ToArray();
                }
            }
        }


        // decrypt(using AES/Rijndael cryptography algorithm)the inputed data using the inputed password
        // and output a decrypted byte array
        private static byte[] DecryptBinaryDataWithKey(byte[] encryptedData, string password)
        {
            // input verification
            if (encryptedData == null || password == null)
            {
                throw new ArgumentNullException();
            }
            if (encryptedData.Length == 0)
            {
                return new byte[0];
            }

            // Create the cryptography algorithm
            using (Rijndael cryptoAlg = Rijndael.Create())
            {
                var salt = new byte[16];
                var iv = new byte[cryptoAlg.IV.Length];
                byte[] buffer;
                int dataLength;

                // Open the input stream
                using (var inputStream = new MemoryStream(encryptedData))
                {
                    // Read the salt and IV from the input stream
                    inputStream.Read(salt, 0, salt.Length);
                    inputStream.Read(iv, 0, iv.Length);

                    // Regenerate the key from the password and salt
                    var passBytes = new Rfc2898DeriveBytes(password, salt);
                    //PasswordDeriveBytes passBytes = new PasswordDeriveBytes(password, salt);
                    byte[] key = passBytes.GetBytes(16);

                    // Set the key and IV on the algorithm
                    cryptoAlg.Key = key;
                    cryptoAlg.IV = iv;

                    // assuming the encrypted data is never shorter than the original data
                    buffer = new byte[encryptedData.Length];

                    // Create the CryptoStream for decrypting the data
                    using (var cryptoStream = new CryptoStream(inputStream, cryptoAlg.CreateDecryptor(), CryptoStreamMode.Read))
                    {
                        // Read the data from the CryptoStream
                        dataLength = cryptoStream.Read(buffer, 0, encryptedData.Length);
                    }
                }

                // Create the output stream
                using (var outputStream = new MemoryStream())
                {
                    outputStream.Write(buffer, 0, dataLength);


                    return outputStream.ToArray();
                }
            }
        }

        #endregion Encrypt/Decrypt with password
    }
}
