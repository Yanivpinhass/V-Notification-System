using Magav.Server.Database;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Magav.Server.Services.Sms;

/// <summary>
/// Background service that polls every 60 seconds and triggers SMS reminder runs
/// when the current time matches a SchedulerConfig entry.
/// Uses IServiceScopeFactory to resolve scoped services (MagavDbManager, SmsReminderService).
/// </summary>
public class SmsSchedulerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SmsSchedulerService> _logger;

    private static readonly TimeZoneInfo IsraelTz =
        TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "Israel Standard Time" : "Asia/Jerusalem");

    public SmsSchedulerService(IServiceScopeFactory scopeFactory, ILogger<SmsSchedulerService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SMS Scheduler Service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndRunScheduledJobs(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Scheduler tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }

        _logger.LogInformation("SMS Scheduler Service stopped");
    }

    private async Task CheckAndRunScheduledJobs(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MagavDbManager>();
        var reminderService = scope.ServiceProvider.GetRequiredService<SmsReminderService>();

        var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, IsraelTz);
        var currentTime = now.ToString("HH:mm");
        var currentDayOfWeek = now.DayOfWeek;

        var configs = await db.SchedulerConfig.GetEnabledAsync();

        foreach (var config in configs)
        {
            if (stoppingToken.IsCancellationRequested) break;

            // Check if current day-of-week is in the config's DayGroup
            var days = GetDaysForGroup(config.DayGroup);
            if (!days.Contains(currentDayOfWeek))
                continue;

            // Check if current time matches (exact HH:mm match)
            if (config.Time != currentTime)
                continue;

            // Calculate target date
            var targetDate = now.Date.AddDays(config.DaysBeforeShift);
            var targetDateStr = targetDate.ToString("yyyy-MM-dd");

            // Check if already ran (pre-check before INSERT)
            if (await db.SchedulerRunLog.ExistsForConfigAndDateAsync(
                config.Id, targetDateStr, config.ReminderType))
            {
                _logger.LogDebug(
                    "Skipping ConfigId={ConfigId}: already ran for {TargetDate} {ReminderType}",
                    config.Id, targetDateStr, config.ReminderType);
                continue;
            }

            _logger.LogInformation(
                "Triggering scheduler run: ConfigId={ConfigId}, DayGroup={DayGroup}, ReminderType={ReminderType}, TargetDate={TargetDate}",
                config.Id, config.DayGroup, config.ReminderType, targetDateStr);

            await reminderService.ExecuteAsync(config, targetDate, stoppingToken);
        }
    }

    private static DayOfWeek[] GetDaysForGroup(string dayGroup) => dayGroup switch
    {
        "SunThu" => new[] {
            DayOfWeek.Sunday, DayOfWeek.Monday, DayOfWeek.Tuesday,
            DayOfWeek.Wednesday, DayOfWeek.Thursday
        },
        "Fri" => new[] { DayOfWeek.Friday },
        "Sat" => new[] { DayOfWeek.Saturday },
        _ => Array.Empty<DayOfWeek>()
    };
}
