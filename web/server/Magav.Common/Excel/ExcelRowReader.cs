using OfficeOpenXml;

namespace Magav.Common.Excel;

/// <summary>
/// Helper for reading cells from an Excel row with automatic type conversion.
/// Supports both sequential reading (advancing column pointer) and direct column access.
/// </summary>
public class ExcelRowReader
{
    private readonly ExcelRange _row;
    private readonly int _rowIndex;
    private int _currentColumn = 1;

    public ExcelRowReader(ExcelRange row, int rowIndex)
    {
        _row = row;
        _rowIndex = rowIndex;
    }

    /// <summary>
    /// Gets the 1-based row index in the Excel file.
    /// </summary>
    public int RowIndex => _rowIndex;

    /// <summary>
    /// Gets the current column position (1-based).
    /// </summary>
    public int CurrentColumn => _currentColumn;

    #region String Reading

    /// <summary>
    /// Reads the next cell as string and advances to next column.
    /// </summary>
    public string ReadString() => GetCellText(_currentColumn++);

    /// <summary>
    /// Reads cell at specific column (1-based) as string.
    /// </summary>
    public string ReadString(int column) => GetCellText(column);

    /// <summary>
    /// Reads the next cell as string or null if empty, and advances to next column.
    /// </summary>
    public string? ReadStringOrNull()
    {
        var text = GetCellText(_currentColumn++);
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    /// <summary>
    /// Reads cell at specific column (1-based) as string or null if empty.
    /// </summary>
    public string? ReadStringOrNull(int column)
    {
        var text = GetCellText(column);
        return string.IsNullOrWhiteSpace(text) ? null : text;
    }

    #endregion

    #region Int Reading

    /// <summary>
    /// Reads the next cell as int? and advances to next column.
    /// </summary>
    public int? ReadInt() => ParseInt(GetCellText(_currentColumn++));

    /// <summary>
    /// Reads cell at specific column (1-based) as int?.
    /// </summary>
    public int? ReadInt(int column) => ParseInt(GetCellText(column));

    /// <summary>
    /// Reads the next cell as int with default value and advances to next column.
    /// </summary>
    public int ReadInt(int defaultValue, bool _ = true) => ParseInt(GetCellText(_currentColumn++)) ?? defaultValue;

    /// <summary>
    /// Reads cell at specific column (1-based) as int with default value.
    /// </summary>
    public int ReadIntAt(int column, int defaultValue) => ParseInt(GetCellText(column)) ?? defaultValue;

    #endregion

    #region Long Reading

    /// <summary>
    /// Reads the next cell as long? and advances to next column.
    /// </summary>
    public long? ReadLong() => ParseLong(GetCellText(_currentColumn++));

    /// <summary>
    /// Reads cell at specific column (1-based) as long?.
    /// </summary>
    public long? ReadLong(int column) => ParseLong(GetCellText(column));

    /// <summary>
    /// Reads the next cell as long with default value and advances to next column.
    /// </summary>
    public long ReadLong(long defaultValue, bool _ = true) => ParseLong(GetCellText(_currentColumn++)) ?? defaultValue;

    #endregion

    #region Decimal Reading

    /// <summary>
    /// Reads the next cell as decimal? and advances to next column.
    /// </summary>
    public decimal? ReadDecimal() => ParseDecimal(GetCellText(_currentColumn++));

    /// <summary>
    /// Reads cell at specific column (1-based) as decimal?.
    /// </summary>
    public decimal? ReadDecimal(int column) => ParseDecimal(GetCellText(column));

    /// <summary>
    /// Reads the next cell as decimal with default value and advances to next column.
    /// </summary>
    public decimal ReadDecimal(decimal defaultValue, bool _ = true) => ParseDecimal(GetCellText(_currentColumn++)) ?? defaultValue;

    /// <summary>
    /// Reads cell at specific column (1-based) as decimal with default value.
    /// </summary>
    public decimal ReadDecimalAt(int column, decimal defaultValue) => ParseDecimal(GetCellText(column)) ?? defaultValue;

    #endregion

    #region Double Reading

    /// <summary>
    /// Reads the next cell as double? and advances to next column.
    /// </summary>
    public double? ReadDouble() => ParseDouble(GetCellText(_currentColumn++));

    /// <summary>
    /// Reads cell at specific column (1-based) as double?.
    /// </summary>
    public double? ReadDouble(int column) => ParseDouble(GetCellText(column));

    /// <summary>
    /// Reads the next cell as double with default value and advances to next column.
    /// </summary>
    public double ReadDouble(double defaultValue, bool _ = true) => ParseDouble(GetCellText(_currentColumn++)) ?? defaultValue;

    #endregion

    #region DateTime Reading

    /// <summary>
    /// Reads the next cell as DateTime? and advances to next column.
    /// </summary>
    public DateTime? ReadDateTime() => ParseDateTime(_currentColumn++);

    /// <summary>
    /// Reads cell at specific column (1-based) as DateTime?.
    /// </summary>
    public DateTime? ReadDateTime(int column) => ParseDateTime(column);

    /// <summary>
    /// Reads the next cell as DateTime with default value and advances to next column.
    /// </summary>
    public DateTime ReadDateTime(DateTime defaultValue, bool _ = true) => ParseDateTime(_currentColumn++) ?? defaultValue;

    /// <summary>
    /// Reads cell at specific column (1-based) as DateTime with default value.
    /// </summary>
    public DateTime ReadDateTimeAt(int column, DateTime defaultValue) => ParseDateTime(column) ?? defaultValue;

    #endregion

    #region Bool Reading

    /// <summary>
    /// Reads the next cell as bool and advances to next column.
    /// Returns true if cell contains trueValue (case-insensitive).
    /// </summary>
    public bool ReadBool(string trueValue = "true") =>
        GetCellText(_currentColumn++).Trim().Equals(trueValue, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Reads cell at specific column (1-based) as bool.
    /// </summary>
    public bool ReadBool(int column, string trueValue = "true") =>
        GetCellText(column).Trim().Equals(trueValue, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Reads the next cell as bool? and advances to next column.
    /// Returns null if cell is empty.
    /// </summary>
    public bool? ReadBoolOrNull(string trueValue = "true", string falseValue = "false")
    {
        var text = GetCellText(_currentColumn++).Trim();
        if (string.IsNullOrWhiteSpace(text))
            return null;
        if (text.Equals(trueValue, StringComparison.OrdinalIgnoreCase))
            return true;
        if (text.Equals(falseValue, StringComparison.OrdinalIgnoreCase))
            return false;
        return null;
    }

    #endregion

    #region Navigation

    /// <summary>
    /// Skips the specified number of columns.
    /// </summary>
    public void Skip(int columns = 1) => _currentColumn += columns;

    /// <summary>
    /// Resets the column pointer to the first column.
    /// </summary>
    public void Reset() => _currentColumn = 1;

    /// <summary>
    /// Sets the column pointer to a specific column (1-based).
    /// </summary>
    public void MoveTo(int column) => _currentColumn = column;

    #endregion

    #region Raw Value Access

    /// <summary>
    /// Gets the raw value of a cell at the specified column.
    /// </summary>
    public object? GetRawValue(int column) => _row[_rowIndex, column].Value;

    /// <summary>
    /// Gets the raw value of the next cell and advances to next column.
    /// </summary>
    public object? GetRawValue() => _row[_rowIndex, _currentColumn++].Value;

    /// <summary>
    /// Checks if the cell at the specified column is empty or whitespace.
    /// </summary>
    public bool IsEmpty(int column) => string.IsNullOrWhiteSpace(GetCellText(column));

    /// <summary>
    /// Checks if the next cell is empty or whitespace (without advancing).
    /// </summary>
    public bool IsCurrentEmpty() => string.IsNullOrWhiteSpace(GetCellText(_currentColumn));

    #endregion

    #region Private Helpers

    private string GetCellText(int column) => _row[_rowIndex, column].Text?.Trim() ?? string.Empty;

    private static int? ParseInt(string text) =>
        int.TryParse(text, out int result) ? result : null;

    private static long? ParseLong(string text) =>
        long.TryParse(text, out long result) ? result : null;

    private static decimal? ParseDecimal(string text) =>
        decimal.TryParse(text, out decimal result) ? result : null;

    private static double? ParseDouble(string text) =>
        double.TryParse(text, out double result) ? result : null;

    private DateTime? ParseDateTime(int column)
    {
        var cell = _row[_rowIndex, column];

        // Try to get as DateTime directly (Excel stores dates as numbers)
        if (cell.Value is DateTime dt)
            return dt;

        if (cell.Value is double d)
            return DateTime.FromOADate(d);

        // Try parsing text
        string text = cell.Text?.Trim() ?? string.Empty;
        return DateTime.TryParse(text, out DateTime result) ? result : null;
    }

    #endregion
}
