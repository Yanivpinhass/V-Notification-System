using OfficeOpenXml;
using OfficeOpenXml.Style;
using System.Drawing;

namespace Magav.Common.Excel;

/// <summary>
/// Generic helper class for reading and writing Excel files using EPPlus.
/// </summary>
public static class ExcelHelper
{
    static ExcelHelper()
    {
        // Required for EPPlus - set once at startup
        ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
    }

    #region UsageExamples
   /*

    // Reading
    var employees = ExcelHelper.ReadExcel<Employee>(
        "employees.xlsx",
        reader => new Employee
        {
            Id = reader.ReadInt(0),
            Name = reader.ReadString(),
            Email = reader.ReadString(),
            Salary = reader.ReadDecimal(0m, true),
            HireDate = reader.ReadDateTime() ?? DateTime.MinValue
        });

    // Writing with custom columns
    var columns = ExcelColumnBuilder<Employee>.Create()
        .Add("שם", e => e.Name)
        .Add("דוא\"ל", e => e.Email)
        .Build();

    ExcelHelper.WriteExcel("output.xlsx", employees, columns, "עובדים");

    */
    #endregion

    #region Reading Excel

    /// <summary>
    /// Reads all rows from an Excel file and parses them into entities.
    /// </summary>
    /// <typeparam name="T">The entity type to parse into</typeparam>
    /// <param name="filePath">Path to the Excel file</param>
    /// <param name="parseRow">Function to parse a row into an entity</param>
    /// <param name="worksheetIndex">Zero-based worksheet index (default: 0)</param>
    /// <param name="startRow">First data row (default: 2, assuming row 1 is header)</param>
    /// <returns>List of parsed entities</returns>
    public static List<T> ReadExcel<T>(
        string filePath,
        Func<ExcelRowReader, T> parseRow,
        int worksheetIndex = 0,
        int startRow = 2)
    {
        using var package = new ExcelPackage(new FileInfo(filePath));
        var worksheet = package.Workbook.Worksheets[worksheetIndex];

        if (worksheet.Dimension == null)
            return new List<T>();

        int totalRows = worksheet.Dimension.Rows;
        int totalColumns = worksheet.Dimension.Columns;

        var results = new List<T>();

        for (int rowIndex = startRow; rowIndex <= totalRows; rowIndex++)
        {
            var row = worksheet.Cells[rowIndex, 1, rowIndex, totalColumns];

            // Skip empty rows
            if (IsEmptyRow(row, rowIndex, totalColumns))
                continue;

            var reader = new ExcelRowReader(row, rowIndex);
            T entity = parseRow(reader);
            results.Add(entity);
        }

        return results;
    }

    /// <summary>
    /// Reads all rows from an Excel stream and parses them into entities.
    /// </summary>
    /// <typeparam name="T">The entity type to parse into</typeparam>
    /// <param name="stream">Stream containing the Excel file</param>
    /// <param name="parseRow">Function to parse a row into an entity</param>
    /// <param name="worksheetIndex">Zero-based worksheet index (default: 0)</param>
    /// <param name="startRow">First data row (default: 2, assuming row 1 is header)</param>
    /// <returns>List of parsed entities</returns>
    public static List<T> ReadExcel<T>(
        Stream stream,
        Func<ExcelRowReader, T> parseRow,
        int worksheetIndex = 0,
        int startRow = 2)
    {
        using var package = new ExcelPackage(stream);
        var worksheet = package.Workbook.Worksheets[worksheetIndex];

        if (worksheet.Dimension == null)
            return new List<T>();

        int totalRows = worksheet.Dimension.Rows;
        int totalColumns = worksheet.Dimension.Columns;

        var results = new List<T>();

        for (int rowIndex = startRow; rowIndex <= totalRows; rowIndex++)
        {
            var row = worksheet.Cells[rowIndex, 1, rowIndex, totalColumns];

            // Skip empty rows
            if (IsEmptyRow(row, rowIndex, totalColumns))
                continue;

            var reader = new ExcelRowReader(row, rowIndex);
            T entity = parseRow(reader);
            results.Add(entity);
        }

        return results;
    }

    /// <summary>
    /// Reads Excel with validation, returning both valid entities and validation errors.
    /// </summary>
    public static ExcelReadResult<T> ReadExcelWithValidation<T>(
        string filePath,
        Func<ExcelRowReader, T> parseRow,
        Func<T, int, List<string>> validate,
        int worksheetIndex = 0,
        int startRow = 2)
    {
        using var package = new ExcelPackage(new FileInfo(filePath));
        var worksheet = package.Workbook.Worksheets[worksheetIndex];

        if (worksheet.Dimension == null)
            return new ExcelReadResult<T>();

        int totalRows = worksheet.Dimension.Rows;
        int totalColumns = worksheet.Dimension.Columns;

        var result = new ExcelReadResult<T>();

        for (int rowIndex = startRow; rowIndex <= totalRows; rowIndex++)
        {
            var row = worksheet.Cells[rowIndex, 1, rowIndex, totalColumns];

            if (IsEmptyRow(row, rowIndex, totalColumns))
                continue;

            var reader = new ExcelRowReader(row, rowIndex);
            T entity = parseRow(reader);

            List<string> errors = validate(entity, rowIndex);

            if (errors.Count > 0)
            {
                result.Errors.Add(new ExcelRowError
                {
                    RowIndex = rowIndex,
                    ErrorMessages = errors
                });
            }
            else
            {
                result.Items.Add(entity);
            }
        }

        return result;
    }

    /// <summary>
    /// Reads Excel stream with validation, returning both valid entities and validation errors.
    /// </summary>
    public static ExcelReadResult<T> ReadExcelWithValidation<T>(
        Stream stream,
        Func<ExcelRowReader, T> parseRow,
        Func<T, int, List<string>> validate,
        int worksheetIndex = 0,
        int startRow = 2)
    {
        using var package = new ExcelPackage(stream);
        var worksheet = package.Workbook.Worksheets[worksheetIndex];

        if (worksheet.Dimension == null)
            return new ExcelReadResult<T>();

        int totalRows = worksheet.Dimension.Rows;
        int totalColumns = worksheet.Dimension.Columns;

        var result = new ExcelReadResult<T>();

        for (int rowIndex = startRow; rowIndex <= totalRows; rowIndex++)
        {
            var row = worksheet.Cells[rowIndex, 1, rowIndex, totalColumns];

            if (IsEmptyRow(row, rowIndex, totalColumns))
                continue;

            var reader = new ExcelRowReader(row, rowIndex);
            T entity = parseRow(reader);

            List<string> errors = validate(entity, rowIndex);

            if (errors.Count > 0)
            {
                result.Errors.Add(new ExcelRowError
                {
                    RowIndex = rowIndex,
                    ErrorMessages = errors
                });
            }
            else
            {
                result.Items.Add(entity);
            }
        }

        return result;
    }

    private static bool IsEmptyRow(ExcelRange row, int rowIndex, int totalColumns)
    {
        for (int col = 1; col <= totalColumns; col++)
        {
            if (!string.IsNullOrWhiteSpace(row[rowIndex, col].Text))
                return false;
        }
        return true;
    }

    #endregion

    #region Writing Excel

    /// <summary>
    /// Creates an Excel file from a list of records.
    /// Properties of TRecord become columns.
    /// </summary>
    public static void WriteExcel<T>(string filePath, List<T> records, string sheetName = "Sheet1")
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add(sheetName);

        var properties = typeof(T).GetProperties();

        // Write headers
        for (int col = 0; col < properties.Length; col++)
        {
            worksheet.Cells[1, col + 1].Value = properties[col].Name;
        }

        // Write data
        worksheet.Cells[2, 1].LoadFromCollection(records, PrintHeaders: false);

        // Style headers
        using (var headerRange = worksheet.Cells[1, 1, 1, properties.Length])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(Color.LightGray);
        }

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Freeze header row
        worksheet.View.FreezePanes(2, 1);

        // Add filter
        if (records.Count > 0)
        {
            worksheet.Cells[1, 1, records.Count + 1, properties.Length].AutoFilter = true;
        }

        File.WriteAllBytes(filePath, package.GetAsByteArray());
    }

    /// <summary>
    /// Creates an Excel file with custom column definitions.
    /// </summary>
    public static void WriteExcel<T>(
        string filePath,
        List<T> records,
        List<ExcelColumnDefinition<T>> columns,
        string sheetName = "Sheet1")
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add(sheetName);

        // Write headers
        for (int col = 0; col < columns.Count; col++)
        {
            worksheet.Cells[1, col + 1].Value = columns[col].Header;
        }

        // Write data
        for (int row = 0; row < records.Count; row++)
        {
            for (int col = 0; col < columns.Count; col++)
            {
                worksheet.Cells[row + 2, col + 1].Value = columns[col].GetValue(records[row]);
            }
        }

        // Style headers
        using (var headerRange = worksheet.Cells[1, 1, 1, columns.Count])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(Color.LightGray);
        }

        worksheet.Cells.AutoFitColumns();
        worksheet.View.FreezePanes(2, 1);

        File.WriteAllBytes(filePath, package.GetAsByteArray());
    }

    /// <summary>
    /// Creates an Excel file and returns it as a byte array.
    /// Properties of TRecord become columns.
    /// </summary>
    public static byte[] WriteExcelToBytes<T>(List<T> records, string sheetName = "Sheet1")
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add(sheetName);

        var properties = typeof(T).GetProperties();

        // Write headers
        for (int col = 0; col < properties.Length; col++)
        {
            worksheet.Cells[1, col + 1].Value = properties[col].Name;
        }

        // Write data
        worksheet.Cells[2, 1].LoadFromCollection(records, PrintHeaders: false);

        // Style headers
        using (var headerRange = worksheet.Cells[1, 1, 1, properties.Length])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(Color.LightGray);
        }

        // Auto-fit columns
        worksheet.Cells.AutoFitColumns();

        // Freeze header row
        worksheet.View.FreezePanes(2, 1);

        // Add filter
        if (records.Count > 0)
        {
            worksheet.Cells[1, 1, records.Count + 1, properties.Length].AutoFilter = true;
        }

        return package.GetAsByteArray();
    }

    /// <summary>
    /// Creates an Excel file with custom column definitions and returns it as a byte array.
    /// </summary>
    public static byte[] WriteExcelToBytes<T>(
        List<T> records,
        List<ExcelColumnDefinition<T>> columns,
        string sheetName = "Sheet1")
    {
        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add(sheetName);

        // Write headers
        for (int col = 0; col < columns.Count; col++)
        {
            worksheet.Cells[1, col + 1].Value = columns[col].Header;
        }

        // Write data
        for (int row = 0; row < records.Count; row++)
        {
            for (int col = 0; col < columns.Count; col++)
            {
                worksheet.Cells[row + 2, col + 1].Value = columns[col].GetValue(records[row]);
            }
        }

        // Style headers
        using (var headerRange = worksheet.Cells[1, 1, 1, columns.Count])
        {
            headerRange.Style.Font.Bold = true;
            headerRange.Style.Fill.PatternType = ExcelFillStyle.Solid;
            headerRange.Style.Fill.BackgroundColor.SetColor(Color.LightGray);
        }

        worksheet.Cells.AutoFitColumns();
        worksheet.View.FreezePanes(2, 1);

        return package.GetAsByteArray();
    }

    #endregion
}
