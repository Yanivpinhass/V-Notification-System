namespace Magav.Common.Excel;

/// <summary>
/// Result of reading Excel with validation.
/// Contains both successfully parsed items and validation errors.
/// </summary>
/// <typeparam name="T">The entity type being read</typeparam>
public class ExcelReadResult<T>
{
    /// <summary>
    /// Successfully parsed and validated items.
    /// </summary>
    public List<T> Items { get; set; } = new();

    /// <summary>
    /// Rows that failed validation with their error messages.
    /// </summary>
    public List<ExcelRowError> Errors { get; set; } = new();

    /// <summary>
    /// Returns true if there are any validation errors.
    /// </summary>
    public bool HasErrors => Errors.Count > 0;

    /// <summary>
    /// Returns true if all rows were parsed successfully without errors.
    /// </summary>
    public bool IsSuccess => Errors.Count == 0;

    /// <summary>
    /// Total number of rows processed (valid + invalid).
    /// </summary>
    public int TotalRows => Items.Count + Errors.Count;

    /// <summary>
    /// Number of successfully parsed rows.
    /// </summary>
    public int SuccessCount => Items.Count;

    /// <summary>
    /// Number of rows that failed validation.
    /// </summary>
    public int ErrorCount => Errors.Count;

    /// <summary>
    /// Gets all error messages as a single formatted string.
    /// </summary>
    public string GetErrorSummary()
    {
        if (!HasErrors)
            return string.Empty;

        return string.Join(Environment.NewLine, Errors.Select(e =>
            $"Row {e.RowIndex}: {string.Join(", ", e.ErrorMessages)}"));
    }
}

/// <summary>
/// Represents a validation error for a specific row in the Excel file.
/// </summary>
public class ExcelRowError
{
    /// <summary>
    /// The 1-based row index in the Excel file where the error occurred.
    /// </summary>
    public int RowIndex { get; set; }

    /// <summary>
    /// List of validation error messages for this row.
    /// </summary>
    public List<string> ErrorMessages { get; set; } = new();

    /// <summary>
    /// Gets all error messages as a single comma-separated string.
    /// </summary>
    public string ErrorSummary => string.Join(", ", ErrorMessages);
}

/// <summary>
/// Defines a column for custom Excel export.
/// Allows mapping entity properties to custom column headers and value extraction.
/// </summary>
/// <typeparam name="T">The entity type being exported</typeparam>
public class ExcelColumnDefinition<T>
{
    /// <summary>
    /// The column header text displayed in the Excel file.
    /// </summary>
    public string Header { get; set; }

    /// <summary>
    /// Function to extract the cell value from an entity.
    /// </summary>
    public Func<T, object?> GetValue { get; set; }

    /// <summary>
    /// Creates a new column definition.
    /// </summary>
    /// <param name="header">Column header text</param>
    /// <param name="getValue">Function to extract value from entity</param>
    public ExcelColumnDefinition(string header, Func<T, object?> getValue)
    {
        Header = header;
        GetValue = getValue;
    }

    /// <summary>
    /// Creates a column definition with a simple property selector.
    /// </summary>
    public static ExcelColumnDefinition<T> Create(string header, Func<T, object?> getValue) =>
        new(header, getValue);
}

/// <summary>
/// Builder class for creating column definitions fluently.
/// </summary>
/// <typeparam name="T">The entity type being exported</typeparam>
public class ExcelColumnBuilder<T>
{
    private readonly List<ExcelColumnDefinition<T>> _columns = new();

    /// <summary>
    /// Adds a column definition.
    /// </summary>
    public ExcelColumnBuilder<T> Add(string header, Func<T, object?> getValue)
    {
        _columns.Add(new ExcelColumnDefinition<T>(header, getValue));
        return this;
    }

    /// <summary>
    /// Builds and returns the list of column definitions.
    /// </summary>
    public List<ExcelColumnDefinition<T>> Build() => _columns;

    /// <summary>
    /// Creates a new column builder.
    /// </summary>
    public static ExcelColumnBuilder<T> Create() => new();
}
