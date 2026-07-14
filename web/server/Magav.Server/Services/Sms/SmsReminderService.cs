using Magav.Common;
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

    public async Task ExecuteAsync(
        SchedulerConfig config,
        DateTime windowStart,
        DateTime windowEnd,
        DateTime runLogTargetDate,
        CancellationToken ct)
    {
        // [windowStart, windowEnd) is the half-open shift-date query range. For SameDay/Advance it
        // is a single day (windowEnd == windowStart + 1) and runLogTargetDate == windowStart, so the
        // query bounds and the RunLog key are byte-identical to the previous single-date behavior.
        // For WeekdayAdvance the window may span several days and runLogTargetDate is the firing day.
        var windowStartStr = windowStart.Date.ToString("o");
        var windowEndStr = windowEnd.Date.ToString("o");
        var runLogDateStr = runLogTargetDate.Date.ToString("yyyy-MM-dd");
        var reminderType = config.ReminderType;

        // Shift-type isolation: AdminAdvance pulls ONLY Administrative shifts; every operational
        // reminder type pulls ONLY Operational. A shift row is exactly one type, so admin + operational
        // sends never bleed across the SmsLog(ShiftId, ReminderType) dedup key.
        var shiftType = reminderType == MagavConstants.ReminderTypes.AdminAdvance
            ? MagavConstants.ShiftTypes.Administrative
            : MagavConstants.ShiftTypes.Operational;

        _logger.LogInformation(
            "Scheduler run starting: ConfigId={ConfigId}, ReminderType={ReminderType}, Window=[{Start}..{End}), RunLogDate={RunLogDate}",
            config.Id, reminderType, windowStart.ToString("yyyy-MM-dd"), windowEnd.ToString("yyyy-MM-dd"), runLogDateStr);

        // Query eligible shifts in the window with approved volunteers,
        // excluding those that already have a successful SmsLog for this ReminderType
        var eligibleShifts = await _db.Db.FetchAsync<ShiftVolunteerDto>(
            @"SELECT s.Id AS ShiftId, s.ShiftDate, s.ShiftName, s.CarId,
                     s.Description, s.ShiftTime, s.Address, s.VehicleLocation,
                     v.Id AS VolunteerId, v.FirstName, v.LastName, v.MappingName, v.MobilePhone,
                     s.LocationId,
                     COALESCE(l.Name, s.CustomLocationName) AS LocationName,
                     COALESCE(l.Navigation, s.CustomLocationNavigation) AS LocationNavigation,
                     l.City AS LocationCity,
                     s.VehicleLocationId,
                     COALESCE(vl.Name, s.VehicleLocation) AS VehicleLocationName,
                     vl.Navigation AS VehicleLocationNavigation,
                     vl.City AS VehicleLocationCity
              FROM Shifts s
              JOIN Volunteers v ON s.VolunteerId = v.Id
              LEFT JOIN Locations l  ON s.LocationId        = l.Id
              LEFT JOIN Locations vl ON s.VehicleLocationId = vl.Id
              WHERE s.ShiftDate >= @0 AND s.ShiftDate < @1
                AND s.ShiftType = @4
                AND s.IsCanceled = 0
                AND v.ApproveToReceiveSms = 1
                AND v.MobilePhone IS NOT NULL
                AND v.MobilePhone != ''
                AND NOT EXISTS (
                    SELECT 1 FROM SmsLog sl
                    WHERE sl.ShiftId = s.Id
                      AND sl.ReminderType = @2
                      AND sl.Status = @3
                )",
            windowStartStr, windowEndStr, reminderType, MagavConstants.SmsStatuses.Success, shiftType);

        var totalEligible = eligibleShifts.Count;
        var smsSent = 0;
        var smsFailed = 0;
        string? runError = null;

        // Monitoring: how many eligible shifts were pulled back from a later (non-working) day onto
        // this run. Always 0 for the single-day SameDay/Advance window.
        var pullBackCount = eligibleShifts.Count(s => s.ShiftDate.Date != windowStart.Date);

        _logger.LogInformation(
            "Found {Count} eligible shifts for {ReminderType}, window [{Start}..{End}), pulled-back={PullBack}",
            totalEligible, reminderType, windowStart.ToString("yyyy-MM-dd"), windowEnd.ToString("yyyy-MM-dd"), pullBackCount);

        // Resolve message template once before the loop
        var template = await _db.MessageTemplates.GetByIdAsync(config.MessageTemplateId);
        if (template == null)
        {
            _logger.LogError("MessageTemplate {Id} not found for config {ConfigId}",
                config.MessageTemplateId, config.Id);
            await _db.SchedulerRunLog.InsertAsync(new SchedulerRunLog
            {
                ConfigId = config.Id,
                ReminderType = config.ReminderType,
                RanAt = DateTime.UtcNow.ToString("o"),
                TargetDate = runLogDateStr,
                TotalEligible = 0,
                SmsSent = 0,
                SmsFailed = 0,
                Status = "Failed",
                Error = "תבנית הודעה לא נמצאה"
            });
            return;
        }

        foreach (var shift in eligibleShifts)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                // 🆕A: derive {תאריך}/{יום} from each shift's OWN date (the window may span several
                // days for WeekdayAdvance). Byte-identical for SameDay/Advance, where the single-day
                // query guarantees shift.ShiftDate == windowStart.
                var message = BuildMessage(template.Content, shift, shift.ShiftDate);
                if (reminderType == MagavConstants.ReminderTypes.SameDay)
                    message += BuildLocationText(shift);           // operational SameDay — unchanged
                else if (reminderType == MagavConstants.ReminderTypes.AdminAdvance)
                    message += BuildAdminSmsBlocks(shift);         // admin scheduled — mission + vehicle blocks (§5)
                var result = await _smsProvider.SendSmsAsync(shift.MobilePhone!, message);

                // Write SmsLog entry
                var smsLog = new SmsLog
                {
                    ShiftId = shift.ShiftId,
                    SentAt = DateTime.UtcNow,
                    Status = result.Success ? MagavConstants.SmsStatuses.Success : MagavConstants.SmsStatuses.Fail,
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
                        Status = MagavConstants.SmsStatuses.Fail,
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
            TargetDate = runLogDateStr,
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
                config.Id, runLogDateStr, reminderType);
        }

        _logger.LogInformation(
            "Scheduler run completed: ConfigId={ConfigId}, Status={Status}, Sent={Sent}, Failed={Failed}",
            config.Id, status, smsSent, smsFailed);
    }

    // These are the OPTIONAL administrative placeholders (their source columns are NULL for operational
    // rows and may be blank for admin rows). When blank, the token itself is STRIPPED (never left as a
    // raw {…}) and any line it emptied is collapsed. The existing 6 placeholders are unchanged.
    private static readonly string[] AdminOptionalPlaceholders =
        { "{תיאור}", "{שעה}", "{מיקום}", "{כתובת}", "{מיקום רכב}" };

    public static string BuildMessage(string template, ShiftVolunteerDto shift, DateTime targetDate)
    {
        var firstName = shift.FirstName ?? "";
        var fullName = !string.IsNullOrEmpty(shift.FirstName) && !string.IsNullOrEmpty(shift.LastName)
            ? $"{shift.FirstName} {shift.LastName}"
            : shift.MappingName;
        var dateStr = targetDate.ToString("dd/MM/yyyy");
        var dayName = GetHebrewDayName(targetDate.DayOfWeek);

        // Existing placeholders — behavior UNCHANGED, so operational output stays byte-for-byte identical.
        var result = template
            .Replace("{שם}", firstName)
            .Replace("{שם מלא}", fullName)
            .Replace("{תאריך}", dateStr)
            .Replace("{יום}", dayName)
            .Replace("{משמרת}", shift.ShiftName)
            .Replace("{רכב}", shift.CarId);

        // Does this template use any administrative placeholder? Operational templates use none, so
        // the strip + line-collapse below is skipped for them (guaranteeing unchanged operational SMS).
        var hasAdmin = AdminOptionalPlaceholders.Any(p => result.Contains(p));

        // Substitute-or-STRIP each optional admin placeholder. Replace {מיקום רכב} BEFORE {מיקום}
        // is irrelevant (their tokens don't overlap — "{מיקום}" requires a '}' immediately after מיקום,
        // absent in "{מיקום רכב}") but we keep an explicit, unambiguous order.
        result = ReplaceOrStrip(result, "{תיאור}", shift.Description);
        result = ReplaceOrStrip(result, "{שעה}", shift.ShiftTime);
        result = ReplaceOrStrip(result, "{כתובת}", shift.Address);
        result = ReplaceOrStrip(result, "{מיקום רכב}", shift.VehicleLocation);
        result = ReplaceOrStrip(result, "{מיקום}", shift.LocationName);

        // Step 3: collapse lines emptied by stripping an absent token + trim trailing whitespace left
        // by an inline strip. Gated on hasAdmin so operational messages are never re-flowed.
        if (hasAdmin)
            result = CollapseBlankLines(result);

        return result;
    }

    // Replace the token with its value when present; otherwise DELETE the token (never ship raw {…}).
    private static string ReplaceOrStrip(string s, string token, string? value)
        => s.Contains(token) ? s.Replace(token, string.IsNullOrWhiteSpace(value) ? "" : value) : s;

    // Remove whitespace-only lines (e.g. a line that was only an absent placeholder) and strip
    // trailing whitespace from each surviving line (e.g. a dangling space from an inline strip).
    // Preserves any line that still has literal content. Line separator normalized to '\n'.
    private static string CollapseBlankLines(string s)
    {
        var lines = s.Replace("\r\n", "\n").Split('\n');
        var kept = lines
            .Select(line => line.TrimEnd())
            .Where(line => line.Length > 0);
        return string.Join("\n", kept);
    }

    // Operational SameDay location append (the "הניידת נמצאת ב…" vehicle wording) — used verbatim for
    // the admin VEHICLE block too (§5b). Delegates to the (name, city, navigation) overload.
    public static string BuildLocationText(ShiftVolunteerDto shift)
        => BuildLocationText(shift.LocationName, shift.LocationCity, shift.LocationNavigation);

    public static string BuildLocationText(string? name, string? city, string? navigation)
    {
        if (string.IsNullOrEmpty(name))
            return "";

        var text = !string.IsNullOrEmpty(city)
            ? $"\nהניידת נמצאת ב{city} ({name})"
            : $"\nהניידת נמצאת אצל {name}";

        if (!string.IsNullOrEmpty(navigation))
            text += $"\n{AppendWazeNavigate(navigation)}";

        return text;
    }

    // Admin MISSION-location block (§5a) — different wording from the vehicle block above.
    // name = mission location name (or free-text custom name), address = the shift's snapshot Address,
    // navigation = live location row's Navigation (Waze). Each line present only when its value is non-empty.
    public static string BuildAdminMissionText(string? name, string? address, string? navigation)
    {
        var sb = new System.Text.StringBuilder();
        if (!string.IsNullOrWhiteSpace(name)) sb.Append($"\nמיקום המשימה: {name}");
        if (!string.IsNullOrWhiteSpace(address)) sb.Append($"\nכתובת: {address}");
        if (!string.IsNullOrWhiteSpace(navigation)) sb.Append($"\n{AppendWazeNavigate(navigation)}");
        return sb.ToString();
    }

    // Combined admin SMS location blocks (mission then vehicle) appended to ALL admin sends (V2-D1).
    // Mission uses the mission-location fields; vehicle reuses BuildLocationText when a Vehicle location
    // is picked (VehicleLocationName has a Waze link), else a plain free-text line (no Waze).
    public static string BuildAdminSmsBlocks(ShiftVolunteerDto shift)
    {
        var mission = BuildAdminMissionText(shift.LocationName, shift.Address, shift.LocationNavigation);

        string vehicle;
        if (shift.VehicleLocationId.HasValue && !string.IsNullOrWhiteSpace(shift.VehicleLocationName))
            vehicle = BuildLocationText(shift.VehicleLocationName, shift.VehicleLocationCity, shift.VehicleLocationNavigation);
        else if (!string.IsNullOrWhiteSpace(shift.VehicleLocation))
            vehicle = $"\nמיקום הרכב: {shift.VehicleLocation}";   // free-text fallback — no Waze
        else
            vehicle = "";

        return mission + vehicle;
    }

    private static string AppendWazeNavigate(string url)
    {
        if (string.IsNullOrEmpty(url))
            return url;

        if (!url.Contains("waze.com", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("waze://", StringComparison.OrdinalIgnoreCase))
            return url;

        if (url.Contains("navigate=yes", StringComparison.OrdinalIgnoreCase))
            return url;

        return url.Contains('?') ? $"{url}&navigate=yes" : $"{url}?navigate=yes";
    }

    // One-shot ADMINISTRATIVE send: builds the message from an EXPLICIT template (assignment or today —
    // resolved from AppSettings by the endpoint), sends to one volunteer, and logs ReminderType=Manual
    // (no dedup, re-sends allowed — D10). Admin sends NEVER go through the operational 1/2 templateId
    // switch. Projects the admin columns + location name so BuildMessage degrades placeholders cleanly.
    public async Task<SmsResult> SendAdminSmsAsync(Shift shift, Volunteer volunteer, MessageTemplate template)
    {
        Location? loc = shift.LocationId.HasValue
            ? await _db.Locations.GetByIdAsync(shift.LocationId.Value)
            : null;
        Location? vehLoc = shift.VehicleLocationId.HasValue
            ? await _db.Locations.GetByIdAsync(shift.VehicleLocationId.Value)
            : null;

        var dto = new ShiftVolunteerDto
        {
            ShiftId = shift.Id,
            ShiftDate = shift.ShiftDate,
            ShiftName = shift.ShiftName,
            CarId = shift.CarId,
            VolunteerId = volunteer.Id,
            FirstName = volunteer.FirstName,
            LastName = volunteer.LastName,
            MappingName = volunteer.MappingName,
            MobilePhone = volunteer.MobilePhone,
            Description = shift.Description,
            ShiftTime = shift.ShiftTime,
            Address = shift.Address,
            VehicleLocation = shift.VehicleLocation,
            LocationId = shift.LocationId,
            LocationName = loc?.Name ?? shift.CustomLocationName,
            LocationNavigation = loc?.Navigation ?? shift.CustomLocationNavigation,
            LocationCity = loc?.City,
            VehicleLocationId = shift.VehicleLocationId,
            VehicleLocationName = vehLoc?.Name ?? shift.VehicleLocation,
            VehicleLocationNavigation = vehLoc?.Navigation,
            VehicleLocationCity = vehLoc?.City
        };

        // Placeholders substitute via BuildMessage; then append the full location blocks (mission +
        // vehicle, incl. Waze) to EVERY admin send (V2-D1) — NOT the operational SameDay block.
        var message = BuildMessage(template.Content, dto, shift.ShiftDate) + BuildAdminSmsBlocks(dto);
        var result = await _smsProvider.SendSmsAsync(volunteer.MobilePhone!, message);

        await _db.SmsLog.InsertAsync(new SmsLog
        {
            ShiftId = shift.Id,
            SentAt = DateTime.UtcNow,
            Status = result.Success ? MagavConstants.SmsStatuses.Success : MagavConstants.SmsStatuses.Fail,
            Error = result.Error,
            ReminderType = MagavConstants.ReminderTypes.Manual
        });

        if (result.Success)
        {
            await _db.Db.ExecuteQueryAsync(
                "UPDATE Shifts SET SmsSentAt = @0 WHERE Id = @1",
                DateTime.UtcNow.ToString("o"), shift.Id);
        }

        return result;
    }

    public async Task<object> SendLocationUpdateAsync(DateTime date, string shiftName, string carId)
    {
        var dateStart = date.Date.ToString("o");
        var dateEnd = date.Date.AddDays(1).ToString("o");

        var eligibleShifts = await _db.Db.FetchAsync<ShiftVolunteerDto>(
            @"SELECT s.Id AS ShiftId, s.ShiftDate, s.ShiftName, s.CarId,
                     v.Id AS VolunteerId, v.FirstName, v.LastName, v.MappingName, v.MobilePhone,
                     s.LocationId,
                     COALESCE(l.Name, s.CustomLocationName) AS LocationName,
                     COALESCE(l.Navigation, s.CustomLocationNavigation) AS LocationNavigation,
                     l.City AS LocationCity
              FROM Shifts s
              JOIN Volunteers v ON s.VolunteerId = v.Id
              LEFT JOIN Locations l ON s.LocationId = l.Id
              WHERE s.ShiftDate >= @0 AND s.ShiftDate < @1
                AND s.ShiftName = @2 AND s.CarId = @3
                AND s.ShiftType = @4
                AND s.IsCanceled = 0
                AND v.ApproveToReceiveSms = 1
                AND v.MobilePhone IS NOT NULL
                AND v.MobilePhone != ''",
            dateStart, dateEnd, shiftName, carId, MagavConstants.ShiftTypes.Operational);

        var smsSent = 0;
        var smsFailed = 0;

        foreach (var shift in eligibleShifts)
        {
            try
            {
                var locationText = BuildLocationText(shift).TrimStart('\n');
                if (string.IsNullOrEmpty(locationText)) continue;

                var message = $"עדכון מיקום הניידת:\n{locationText}\nמשמרת נעימה";
                var result = await _smsProvider.SendSmsAsync(shift.MobilePhone!, message);

                await _db.SmsLog.InsertAsync(new SmsLog
                {
                    ShiftId = shift.ShiftId,
                    SentAt = DateTime.UtcNow,
                    Status = result.Success ? MagavConstants.SmsStatuses.Success : MagavConstants.SmsStatuses.Fail,
                    Error = result.Error,
                    ReminderType = MagavConstants.ReminderTypes.LocationUpdate
                });

                if (result.Success) smsSent++;
                else smsFailed++;
            }
            catch (Exception ex)
            {
                smsFailed++;
                _logger.LogError(ex, "Error sending location update SMS for ShiftId={ShiftId}", shift.ShiftId);
            }
        }

        return new { SmsSent = smsSent, SmsFailed = smsFailed };
    }

    public static string GetHebrewDayName(DayOfWeek day) => day switch
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
    public int? LocationId { get; set; }
    public string? LocationName { get; set; }
    public string? LocationNavigation { get; set; }
    public string? LocationCity { get; set; }

    // Administrative-shifts columns (NULL for operational rows). Projected so BuildMessage can
    // substitute {תיאור}/{שעה}/{כתובת}/{מיקום רכב} — otherwise raw tokens would ship in admin SMS.
    public string? Description { get; set; }
    public string? ShiftTime { get; set; }
    public string? Address { get; set; }
    public string? VehicleLocation { get; set; }

    // v2: resolved Vehicle-location fields (for the SMS vehicle block). NULL for operational rows and
    // for admin rows using free-text VehicleLocation.
    public int? VehicleLocationId { get; set; }
    public string? VehicleLocationName { get; set; }
    public string? VehicleLocationNavigation { get; set; }
    public string? VehicleLocationCity { get; set; }
}
