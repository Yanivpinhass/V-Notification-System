using Magav.Common.Models;
using OfficeOpenXml;

namespace Magav.Server.Helpers;

/// <summary>
/// Parses weekly shift schedule Excel files (תוכנית מתמי"ד) into a list of ExcelShift records.
/// Each Excel file contains one or more sheets, each with weekly blocks of 4 teams.
/// Columns A-G represent Sunday through Saturday.
/// </summary>
public static class ShiftScheduleParser
{
    private const int TeamCount = 4;
    private const int RowsPerTeam = 6; // name + car + 4 volunteers
    private const int VolunteerRowsPerTeam = 4;
    private const int ColumnsToRead = 7; // A through G
    private const int TeamBlockOffset = 3; // teams start 3 rows after the date row

    static ShiftScheduleParser()
    {
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
    }

    /// <summary>
    /// Parses a shift schedule Excel file from disk.
    /// </summary>
    public static List<ExcelShift> Parse(string filePath)
    {
        using var package = new ExcelPackage(new FileInfo(filePath));
        return ParseWorkbook(package);
    }

    /// <summary>
    /// Parses a shift schedule Excel file from a stream.
    /// </summary>
    public static List<ExcelShift> Parse(Stream stream)
    {
        using var package = new ExcelPackage(stream);
        return ParseWorkbook(package);
    }

    private static List<ExcelShift> ParseWorkbook(ExcelPackage package)
    {
        var results = new List<ExcelShift>();

        Console.Error.WriteLine($"[ShiftParser] Worksheets count: {package.Workbook.Worksheets.Count}");

        foreach (var worksheet in package.Workbook.Worksheets)
        {
            Console.Error.WriteLine($"[ShiftParser] Sheet: '{worksheet.Name}', Dimension: {worksheet.Dimension?.Address ?? "NULL"}");

            if (worksheet.Dimension == null)
                continue;

            int totalRows = worksheet.Dimension.Rows;
            var dateRows = FindDateRows(worksheet, totalRows);

            Console.Error.WriteLine($"[ShiftParser] Sheet '{worksheet.Name}': totalRows={totalRows}, dateRows found={dateRows.Count}");

            foreach (int dateRow in dateRows)
            {
                // Ensure all team data fits within the worksheet
                int lastRequiredRow = dateRow + TeamBlockOffset + (TeamCount * RowsPerTeam) - 1;
                if (lastRequiredRow > totalRows)
                {
                    Console.Error.WriteLine($"[ShiftParser] Skipping dateRow {dateRow}: lastRequiredRow {lastRequiredRow} > totalRows {totalRows}");
                    continue;
                }

                ParseWeekBlock(worksheet, dateRow, results);
            }
        }

        Console.Error.WriteLine($"[ShiftParser] Total ExcelShifts parsed: {results.Count}");
        return results;
    }

    private static List<int> FindDateRows(ExcelWorksheet worksheet, int totalRows)
    {
        var dateRows = new List<int>();

        for (int row = 1; row <= totalRows; row++)
        {
            var dt = GetCellAsDateTime(worksheet.Cells[row, 1]);
            if (dt.HasValue && dt.Value.Year > 1901)
            {
                dateRows.Add(row);
            }
        }

        return dateRows;
    }

    /// <summary>
    /// Reads a cell value as DateTime, handling both DateTime and double (OLE serial date) values.
    /// EPPlus may return dates as doubles depending on the cell formatting.
    /// </summary>
    private static DateTime? GetCellAsDateTime(ExcelRange cell)
    {
        var value = cell.Value;
        if (value is DateTime dt)
            return dt;
        if (value is double d && d > 0)
            return DateTime.FromOADate(d);
        return null;
    }

    private static void ParseWeekBlock(ExcelWorksheet worksheet, int dateRow, List<ExcelShift> results)
    {
        for (int team = 0; team < TeamCount; team++)
        {
            int nameRow = dateRow + TeamBlockOffset + (team * RowsPerTeam);
            int carRow = nameRow + 1;
            int firstVolunteerRow = carRow + 1;

            string teamName = worksheet.Cells[nameRow, 1].Text?.Trim() ?? string.Empty;
            string carNumber = worksheet.Cells[carRow, 1].Text?.Trim() ?? string.Empty;

            if (string.IsNullOrEmpty(teamName))
                continue;

            for (int col = 1; col <= ColumnsToRead; col++)
            {
                var shiftDateValue = GetCellAsDateTime(worksheet.Cells[dateRow, col]);
                if (!shiftDateValue.HasValue)
                    continue;
                var shiftDate = shiftDateValue.Value;

                var volunteers = new List<string>();
                for (int v = 0; v < VolunteerRowsPerTeam; v++)
                {
                    string name = worksheet.Cells[firstVolunteerRow + v, col].Text?.Trim() ?? string.Empty;
                    if (!string.IsNullOrEmpty(name))
                    {
                        volunteers.Add(name);
                    }
                }

                if (volunteers.Count == 0)
                    continue;

                results.Add(new ExcelShift
                {
                    Date = shiftDate.Date,
                    Name = teamName,
                    Car = carNumber,
                    Volunteers = volunteers
                });
            }
        }
    }
}
