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

            // Compute the eligibility window and the RunLog key:
            //  • SameDay/Advance: single-day window [today+N, today+N+1); RunLog key = today+N
            //    (byte-identical to the previous single-date behavior).
            //  • WeekdayAdvance: half-open window [today+N, nextWorkingDay(today)+N) so shifts whose
            //    natural send day lands on Fri/Sat/holiday/holiday-eve are pulled back onto this
            //    working day; RunLog key = today (the firing day, so one row per windowed run).
            var today = now.Date;
            var n = config.DaysBeforeShift;
            var windowStart = today.AddDays(n);
            DateTime windowEnd;
            DateTime runLogTargetDate;

            if (config.ReminderType == MagavConstants.ReminderTypes.WeekdayAdvance)
            {
                var nextWorkingDay = await NextWorkingDayAsync(today, db);
                windowEnd = nextWorkingDay.AddDays(n);
                runLogTargetDate = today;
            }
            else
            {
                windowEnd = windowStart.AddDays(1);
                runLogTargetDate = windowStart;
            }

            _logger.LogInformation(
                "Triggering scheduler run: ConfigId={ConfigId}, DayGroup={DayGroup}, ReminderType={ReminderType}, FiringDay={FiringDay}, EffectiveGroup={EffectiveGroup}, Window=[{Start}..{End})",
                config.Id, config.DayGroup, config.ReminderType, today.ToString("yyyy-MM-dd"),
                effectiveDayGroup, windowStart.ToString("yyyy-MM-dd"), windowEnd.ToString("yyyy-MM-dd"));

            await reminderService.ExecuteAsync(config, windowStart, windowEnd, runLogTargetDate, stoppingToken);
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

    /// <summary>
    /// True when <paramref name="date"/> is a working day (effective group SunThu — not Fri/Sat/holiday/
    /// holiday-eve). Propagates DB exceptions so the caller decides the fallback.
    /// </summary>
    private static async Task<bool> IsWorkingDayAsync(DateTime date, MagavDbManager db)
        => await GetEffectiveDayGroupAsync(date, db) == MagavConstants.DayGroups.SunThu;

    /// <summary>
    /// Smallest date strictly after <paramref name="from"/> that is a working day. Bounded walk
    /// (max 14 days) with its own try/catch so a holiday-data gap or DB error can never crash the
    /// tick or loop forever — falls back to the next plain Sun–Thu weekday.
    /// </summary>
    private async Task<DateTime> NextWorkingDayAsync(DateTime from, MagavDbManager db)
    {
        try
        {
            var candidate = from.Date.AddDays(1);
            for (var i = 0; i < 14; i++)
            {
                if (await IsWorkingDayAsync(candidate, db))
                    return candidate;
                candidate = candidate.AddDays(1);
            }
            _logger.LogWarning(
                "NextWorkingDayAsync exceeded 14-day bound from {From}; falling back to next weekday",
                from.ToString("yyyy-MM-dd"));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "NextWorkingDayAsync failed from {From}; falling back to next weekday",
                from.ToString("yyyy-MM-dd"));
        }
        return NextPlainWeekday(from.Date);
    }

    /// <summary>Next Sun–Thu strictly after <paramref name="from"/>, ignoring holidays (pure-weekday fallback).</summary>
    private static DateTime NextPlainWeekday(DateTime from)
    {
        var d = from.AddDays(1);
        while (d.DayOfWeek == DayOfWeek.Friday || d.DayOfWeek == DayOfWeek.Saturday)
            d = d.AddDays(1);
        return d;
    }
}
