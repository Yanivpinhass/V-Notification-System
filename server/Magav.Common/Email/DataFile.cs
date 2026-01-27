namespace Magav.Common.Email
{
    public class DataFile
    {
        public DataFile(string name, byte[] file)
        {
            Name = name;
            File = file;
        }

        public string Name { get; }

        public byte[] File { get; }
    }
}
