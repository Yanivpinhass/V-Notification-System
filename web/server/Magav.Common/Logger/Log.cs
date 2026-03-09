using System.Reflection;
using System.Runtime.CompilerServices;
using Serilog;
using Serilog.Context;
using Serilog.Events;

namespace Magav.Common.Logger
{
    public static class Log
    {
        private const string ModuleName = "ModuleName";
        private const string FileName = "FileName";
        private const string MemberName = "MemberName";

        static Log()
        {
            Serilog.Log.Logger = new LoggerConfiguration()
                .Enrich.FromLogContext()
                .ReadFrom.Configuration(ConfigurationHelper.Configuration)
                .CreateLogger();
        }

        private static void Write(LogEventLevel level, string message, Exception ex, string moduleName, string sourceFilePath, string memberName)
        {
            using IDisposable
                prop1 = LogContext.PushProperty(ModuleName, moduleName),
                prop2 = LogContext.PushProperty(FileName, Path.GetFileNameWithoutExtension(sourceFilePath)),
                prop3 = LogContext.PushProperty(MemberName, memberName);

            Serilog.Log.Write(level, ex, message);
        }

        public static void WriteVerbose(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Verbose, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);

        public static void WriteDebug(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Debug, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);

        public static void WriteInformation(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Information, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);

        public static void WriteWarning(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Warning, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);

        public static void WriteError(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Error, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);

        public static void WriteFatal(string message, Exception ex = null, [CallerFilePath] string sourceFilePath = "", [CallerMemberName] string memberName = "")
            => Write(LogEventLevel.Fatal, message, ex, Assembly.GetCallingAssembly().GetName().Name, sourceFilePath, memberName);
    }
}
