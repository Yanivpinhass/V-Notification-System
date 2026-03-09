using Magav.Common.Models;
using Magav.Server.Database;
using Microsoft.Extensions.Logging;

namespace Magav.Server.Services.Sms;

public class SmsReminderService
{
    private readonly MagavDbManager _db;
    private readonly ISmsProvider _smsProvider;
    private readonly ILogger<SmsReminderService> _logger;

    public SmsReminderService(
        MagavDbManager db,
        ISmsProvider smsProvider,
        ILogger<SmsReminderService> logger)
    {
        _db = db;
        _smsProvider = smsProvider;
        _logger = logger;
    }

    public async Task ExecuteAsync(SchedulerConfig config, DateTime targetDate, CancellationToken ct)
    {
        var targetDateStart = targetDate.Date.ToString("o");
        var targetDateEnd = targetDate.Date.AddDays(1).ToString("o");
        var targetDateStr = targetDate.Date.ToString("yyyy-MM-dd");
        var reminderType = config.ReminderType;

        _logger.LogInformation(
            "Scheduler run starting: ConfigId={ConfigId}, ReminderType={ReminderType}, TargetDate={TargetDate}",
            config.Id, reminderType, targetDateStr);

        // Query eligible shifts: shifts on target date with approved volunteers,
        // excluding those that already have a successful SmsLog for this ReminderType
        var eligibleShifts = await _db.Db.FetchAsync<ShiftVolunteerDto>(
            @"SELECT s.Id AS ShiftId, s.ShiftDate, s.ShiftName, s.CarId,
                     v.Id AS VolunteerId, v.FirstName, v.LastName, v.MappingName, v.MobilePhone
              FROM Shifts s
              JOIN Volunteers v ON s.VolunteerId = v.Id
              WHERE s.ShiftDate >= @0 AND s.ShiftDate < @1
                AND v.ApproveToReceiveSms = 1
                AND v.MobilePhone IS NOT NULL
                AND v.MobilePhone != ''
                AND NOT EXISTS (
                    SELECT 1 FROM SmsLog sl
                    WHERE sl.ShiftId = s.Id
                      AND sl.ReminderType = @2
                      AND sl.Status = 'Success'
                )",
            targetDateStart, targetDateEnd, reminderType);

        var totalEligible = eligibleShifts.Count;
        var smsSent = 0;
        var smsFailed = 0;
        string? runError = null;

        _logger.LogInformation("Found {Count} eligible shifts for {ReminderType} on {TargetDate}",
            totalEligible, reminderType, targetDateStr);

        foreach (var shift in eligibleShifts)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                var message = BuildMessage(config.MessageTemplate, shift, targetDate);
                var result = await _smsProvider.SendSmsAsync(shift.MobilePhone!, message);

                // Write SmsLog entry
                var smsLog = new SmsLog
                {
                    ShiftId = shift.ShiftId,
                    SentAt = DateTime.UtcNow,
                    Status = result.Success ? "Success" : "Fail",
                    Error = result.Error,
                    ReminderType = reminderType
                };
                await _db.SmsLog.InsertAsync(smsLog);

                // Update SmsSentAt on success (general indicator)
                if (result.Success)
                {
                    smsSent++;
                    await _db.Db.ExecuteQueryAsync(
                        "UPDATE Shifts SET SmsSentAt = @0 WHERE Id = @1",
                        DateTime.UtcNow.ToString("o"), shift.ShiftId);
                }
                else
                {
                    smsFailed++;
                    _logger.LogWarning("SMS failed for ShiftId={ShiftId}: {Error}",
                        shift.ShiftId, result.Error);
                }
            }
            catch (Exception ex)
            {
                smsFailed++;
                _logger.LogError(ex, "Error sending SMS for ShiftId={ShiftId}", shift.ShiftId);

                // Still log the failure in SmsLog
                try
                {
                    var smsLog = new SmsLog
                    {
                        ShiftId = shift.ShiftId,
                        SentAt = DateTime.UtcNow,
                        Status = "Fail",
                        Error = "שגיאה פנימית",
                        ReminderType = reminderType
                    };
                    await _db.SmsLog.InsertAsync(smsLog);
                }
                catch (Exception logEx)
                {
                    _logger.LogError(logEx, "Failed to write SmsLog for ShiftId={ShiftId}", shift.ShiftId);
                }
            }
        }

        // Determine run status
        var status = totalEligible == 0 ? "Completed"
            : smsFailed == 0 ? "Completed"
            : smsSent == 0 ? "Failed"
            : "Partial";

        if (smsFailed > 0)
            runError = $"{smsFailed} הודעות נכשלו";

        // Insert SchedulerRunLog (UNIQUE constraint prevents duplicates)
        var runLog = new SchedulerRunLog
        {
            ConfigId = config.Id,
            ReminderType = reminderType,
            RanAt = DateTime.UtcNow.ToString("o"),
            TargetDate = targetDateStr,
            TotalEligible = totalEligible,
            SmsSent = smsSent,
            SmsFailed = smsFailed,
            Status = status,
            Error = runError
        };

        var inserted = await _db.SchedulerRunLog.InsertAsync(runLog);
        if (inserted == null)
        {
            _logger.LogWarning(
                "SchedulerRunLog already exists for ConfigId={ConfigId}, TargetDate={TargetDate}, ReminderType={ReminderType}",
                config.Id, targetDateStr, reminderType);
        }

        _logger.LogInformation(
            "Scheduler run completed: ConfigId={ConfigId}, Status={Status}, Sent={Sent}, Failed={Failed}",
            config.Id, status, smsSent, smsFailed);
    }

    private static string BuildMessage(string template, ShiftVolunteerDto shift, DateTime targetDate)
    {
        var firstName = shift.FirstName ?? "";
        var fullName = !string.IsNullOrEmpty(shift.FirstName) && !string.IsNullOrEmpty(shift.LastName)
            ? $"{shift.FirstName} {shift.LastName}"
            : shift.MappingName;
        var dateStr = targetDate.ToString("dd/MM/yyyy");
        var dayName = GetHebrewDayName(targetDate.DayOfWeek);

        return template
            .Replace("{שם}", firstName)
            .Replace("{שם מלא}", fullName)
            .Replace("{תאריך}", dateStr)
            .Replace("{יום}", dayName)
            .Replace("{משמרת}", shift.ShiftName)
            .Replace("{רכב}", shift.CarId);
    }

    private static string GetHebrewDayName(DayOfWeek day) => day switch
    {
        DayOfWeek.Sunday => "יום א׳",
        DayOfWeek.Monday => "יום ב׳",
        DayOfWeek.Tuesday => "יום ג׳",
        DayOfWeek.Wednesday => "יום ד׳",
        DayOfWeek.Thursday => "יום ה׳",
        DayOfWeek.Friday => "יום ו׳",
        DayOfWeek.Saturday => "שבת",
        _ => "לא ידוע"
    };
}

/// <summary>
/// DTO for the shift+volunteer join query used by the scheduler.
/// </summary>
public class ShiftVolunteerDto
{
    public int ShiftId { get; set; }
    public DateTime ShiftDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string CarId { get; set; } = string.Empty;
    public int VolunteerId { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string MappingName { get; set; } = string.Empty;
    public string? MobilePhone { get; set; }
}
