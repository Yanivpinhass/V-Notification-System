using Magav.Common;
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

        var configs = await db.SchedulerConfig.GetEnabledAsync();

        // Determine effective day group (holiday-aware, with graceful fallback)
        string effectiveDayGroup;
        try
        {
            effectiveDayGroup = await GetEffectiveDayGroupAsync(now, db);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to check Jewish holidays, falling back to normal day-of-week");
            effectiveDayGroup = GetNormalDayGroup(now.DayOfWeek);
        }

        // Log holiday override (only when different from normal)
        var normalGroup = GetNormalDayGroup(now.DayOfWeek);
        if (effectiveDayGroup != normalGroup)
            _logger.LogInformation("Holiday override: {DayOfWeek} -> effective group '{Group}'",
                now.DayOfWeek, effectiveDayGroup);

        foreach (var config in configs)
        {
            if (stoppingToken.IsCancellationRequested) break;

            // Check if config's DayGroup matches the effective day group
            if (config.DayGroup != effectiveDayGroup)
                continue;

            // Check if current time matches (exact HH:mm match)
            if (config.Time != currentTime)
                continue;

            // Calculate target date
            var targetDate = now.Date.AddDays(config.DaysBeforeShift);
            var targetDateStr = targetDate.ToString("yyyy-MM-dd");

            _logger.LogInformation(
                "Triggering scheduler run: ConfigId={ConfigId}, DayGroup={DayGroup}, ReminderType={ReminderType}, TargetDate={TargetDate}",
                config.Id, config.DayGroup, config.ReminderType, targetDateStr);

            await reminderService.ExecuteAsync(config, targetDate, stoppingToken);
        }
    }

    /// <summary>
    /// Normal day-of-week mapping (used as fallback if holiday check fails).
    /// </summary>
    private static string GetNormalDayGroup(DayOfWeek day) => day switch
    {
        DayOfWeek.Saturday => MagavConstants.DayGroups.Sat,
        DayOfWeek.Friday => MagavConstants.DayGroups.Fri,
        _ => MagavConstants.DayGroups.SunThu
    };

    /// <summary>
    /// Holiday-aware day group resolution.
    /// Priority: Saturday > today is holiday > Friday > tomorrow is holiday > default.
    /// </summary>
    private static async Task<string> GetEffectiveDayGroupAsync(DateTime now, MagavDbManager db)
    {
        if (now.DayOfWeek == DayOfWeek.Saturday)
            return MagavConstants.DayGroups.Sat;

        var todayStr = now.Date.ToString("yyyy-MM-dd");
        if (await db.JewishHolidays.IsHolidayAsync(todayStr))
            return MagavConstants.DayGroups.Sat;

        if (now.DayOfWeek == DayOfWeek.Friday)
            return MagavConstants.DayGroups.Fri;

        var tomorrowStr = now.Date.AddDays(1).ToString("yyyy-MM-dd");
        if (await db.JewishHolidays.IsHolidayAsync(tomorrowStr))
            return MagavConstants.DayGroups.Fri;

        return MagavConstants.DayGroups.SunThu;
    }
}
