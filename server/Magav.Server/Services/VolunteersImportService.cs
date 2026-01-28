using System.Linq;
using Magav.Common.Excel;
using Magav.Common.Models;
using Magav.Server.Database;

namespace Magav.Server.Services;

public class VolunteersImportService
{
    private const int MaxRows = 10000; // DoS protection

    public async Task<ImportResult> ImportFromExcelAsync(Stream fileStream, MagavDbManager db)
    {
        var result = new ImportResult();

        // Use existing ExcelHelper.ReadExcel with ExcelRowReader
        List<VolunteerRow> rows;
        try
        {
            rows = ExcelHelper.ReadExcel<VolunteerRow>(
                fileStream,
                reader => new VolunteerRow(
                    InternalId: reader.ReadString(),     // Column 1: מ.א
                    Name: reader.ReadString(),           // Column 2: שם
                    Phone: reader.ReadStringOrNull()     // Column 3: טלפון
                ));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[VolunteersImport] Excel read error: {ex}");
            return new ImportResult { Errors = 1, ErrorMessages = { "שגיאה בקריאת הקובץ" } };
        }

        result.TotalRows = rows.Count;

        if (rows.Count == 0)
        {
            result.Errors = 1;
            result.ErrorMessages.Add("הקובץ ריק או לא מכיל נתונים");
            return result;
        }

        if (rows.Count > MaxRows)
        {
            result.Errors = 1;
            result.ErrorMessages.Add($"הקובץ מכיל {rows.Count} שורות, מותר עד {MaxRows}");
            return result;
        }

        // Process rows individually (no transaction - DbHelper creates new connections per operation,
        // which is incompatible with SQLite's file-level locking when using transactions)
        int rowNumber = 2; // Excel row 2 (row 1 is header)
        foreach (var row in rows)
        {
            // Validate required fields
            if (string.IsNullOrWhiteSpace(row.InternalId))
            {
                result.Errors++;
                result.ErrorMessages.Add($"שורה {rowNumber}: חסר מ.א");
                rowNumber++;
                continue;
            }
            if (string.IsNullOrWhiteSpace(row.Name))
            {
                result.Errors++;
                result.ErrorMessages.Add($"שורה {rowNumber}: חסר שם");
                rowNumber++;
                continue;
            }

            try
            {
                var volunteer = new Volunteer
                {
                    MappingName = row.Name.Trim(),
                    MobilePhone = SanitizePhoneNumber(row.Phone)
                };

                bool inserted = await db.Volunteers.UpsertByInternalIdAsync(volunteer, row.InternalId.Trim());
                if (inserted) result.Inserted++; else result.Updated++;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[VolunteersImport] Row {rowNumber} error: {ex}");
                result.Errors++;
                result.ErrorMessages.Add($"שורה {rowNumber}: שגיאה בעיבוד השורה");
            }
            rowNumber++;
        }
        return result;
    }

    private static string? SanitizePhoneNumber(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digitsOnly = new string(phone.Where(char.IsDigit).ToArray());
        if (string.IsNullOrEmpty(digitsOnly)) return null;
        return digitsOnly.StartsWith('0') ? digitsOnly : "0" + digitsOnly;
    }

    // Internal DTO for Excel row parsing
    private record VolunteerRow(string InternalId, string Name, string? Phone);
}

public class ImportResult
{
    public int TotalRows { get; set; }
    public int Inserted { get; set; }
    public int Updated { get; set; }
    public int Errors { get; set; }
    public List<string> ErrorMessages { get; set; } = new();
}
