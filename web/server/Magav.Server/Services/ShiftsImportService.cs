using Magav.Common.Models;
using Magav.Server.Database;
using Magav.Server.Helpers;

namespace Magav.Server.Services;

public class ShiftsImportService
{
    public async Task<ImportResult> ImportFromExcelAsync(Stream fileStream, MagavDbManager db)
    {
        var result = new ImportResult();

        // 1. Parse Excel
        List<ExcelShift> excelShifts;
        try
        {
            excelShifts = ShiftScheduleParser.Parse(fileStream);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ShiftsImport] Excel parse error: {ex}");
            return new ImportResult { Errors = 1, ErrorMessages = { "שגיאה בקריאת הקובץ" } };
        }

        // 2. Early exit if empty
        if (excelShifts.Count == 0)
        {
            result.Errors = 1;
            result.ErrorMessages.Add("הקובץ ריק או לא מכיל נתוני משמרות");
            return result;
        }

        // 3. Filter to today and future only
        var today = DateTime.Today;
        var futureShifts = excelShifts.Where(s => s.Date >= today).ToList();

        // 4. Load all volunteers and build lookup dictionary
        var allVolunteers = await db.Volunteers.GetAllAsync();
        var volunteerLookup = new Dictionary<string, Volunteer>(StringComparer.OrdinalIgnoreCase);
        foreach (var v in allVolunteers)
        {
            var key = v.MappingName.Trim();
            if (!string.IsNullOrEmpty(key))
                volunteerLookup.TryAdd(key, v);
        }

        // 5-6. Match volunteers and build Shift records
        var newShifts = new List<Shift>();
        var unmatchedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        int totalAssignments = 0;

        foreach (var excelShift in futureShifts)
        {
            foreach (var volunteerName in excelShift.Volunteers)
            {
                totalAssignments++;
                var trimmedName = volunteerName.Trim();

                if (volunteerLookup.TryGetValue(trimmedName, out var volunteer))
                {
                    newShifts.Add(new Shift
                    {
                        ShiftDate = excelShift.Date,
                        ShiftName = excelShift.Name,
                        CarId = excelShift.Car,
                        VolunteerId = volunteer.Id,
                        CreatedAt = DateTime.UtcNow
                    });
                }
                else
                {
                    unmatchedNames.Add(trimmedName);
                }
            }
        }

        result.TotalRows = totalAssignments;

        // 7. Deduplicate by (ShiftDate, ShiftName, VolunteerId)
        newShifts = newShifts
            .GroupBy(s => (s.ShiftDate, s.ShiftName, s.VolunteerId))
            .Select(g => g.First())
            .ToList();

        // 8. Build error messages from unique unmatched names
        foreach (var name in unmatchedNames)
        {
            result.Errors++;
            result.ErrorMessages.Add($"לא נמצא מתנדב: {name}");
        }

        // 9. Delete future shifts and insert new ones
        try
        {
            await db.Db.DeleteManyAsync<Shift>(s => s.ShiftDate >= today);
            if (newShifts.Count > 0)
            {
                await db.Db.BulkInsertAsync(newShifts);
            }
            result.Inserted = newShifts.Count;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ShiftsImport] DB error: {ex}");
            result.Errors++;
            result.ErrorMessages.Add("שגיאה בשמירת המשמרות");
        }

        return result;
    }
}
