using Magav.Server.Database;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Magav.Server.Services;

public class ShiftCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShiftCleanupService> _logger;
    private int _lastCleanupMonth = -1;

    private static readonly TimeZoneInfo IsraelTz =
        TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "Israel Standard Time" : "Asia/Jerusalem");

    public ShiftCleanupService(IServiceScopeFactory scopeFactory, ILogger<ShiftCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Shift Cleanup Service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndRunCleanup();
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Shift cleanup tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("Shift Cleanup Service stopped");
    }

    private async Task CheckAndRunCleanup()
    {
        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, IsraelTz);

        if (now.Day != 1)
            return;

        if (_lastCleanupMonth == now.Month)
            return;

        _logger.LogInformation("Running monthly shift cleanup for {Month}/{Year}", now.Month, now.Year);

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MagavDbManager>();

        var cutoffDate = new DateTime(now.Year, now.Month, 1).AddMonths(-1);
        var cutoffDateStr = cutoffDate.ToString("yyyy-MM-dd");

        try
        {
            var smsLogCount = await db.Db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM SmsLog WHERE ShiftId IN (SELECT Id FROM Shifts WHERE ShiftDate < @0)",
                cutoffDate);

            await db.Db.ExecuteQueryAsync(
                "DELETE FROM SmsLog WHERE ShiftId IN (SELECT Id FROM Shifts WHERE ShiftDate < @0)",
                cutoffDate);

            var shiftsCount = await db.Db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Shifts WHERE ShiftDate < @0",
                cutoffDate);

            await db.Db.ExecuteQueryAsync(
                "DELETE FROM Shifts WHERE ShiftDate < @0",
                cutoffDate);

            var runLogCount = await db.Db.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM SchedulerRunLog WHERE TargetDate < @0",
                cutoffDateStr);

            await db.Db.ExecuteQueryAsync(
                "DELETE FROM SchedulerRunLog WHERE TargetDate < @0",
                cutoffDateStr);

            _lastCleanupMonth = now.Month;

            _logger.LogInformation(
                "Monthly cleanup completed: {ShiftsDeleted} shifts, {SmsLogDeleted} SMS logs, {RunLogDeleted} run logs deleted (cutoff: {Cutoff})",
                shiftsCount, smsLogCount, runLogCount, cutoffDateStr);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Monthly shift cleanup failed");
            throw;
        }
    }
}
