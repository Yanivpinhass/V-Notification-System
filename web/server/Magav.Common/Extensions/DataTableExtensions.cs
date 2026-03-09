using System.ComponentModel;
using System.Data;
using System.Reflection;
using NPoco;
using ColumnAttribute = System.ComponentModel.DataAnnotations.Schema.ColumnAttribute;

namespace Magav.Common.Extensions;

public static class DataTableExtensions
{
    public static DataTable AsDataTable<T>(this IEnumerable<T> data)
    {
        PropertyDescriptorCollection properties = TypeDescriptor.GetProperties(typeof(T));

        List<string> ignoreColumnsNames = GetIgnoreAndResultColumnsNames<T>();

        var table = new DataTable();
        foreach (PropertyDescriptor prop in properties)
        {
            if (ignoreColumnsNames.Contains(prop.Name))
            {
                continue;
            }

            AttributeCollection attributes1 = prop.Attributes;

            // Filter out system attributes
            var customAttributes = attributes1.OfType<ColumnAttribute>();
            bool hasCustomAttributes = customAttributes.Any();
            if (hasCustomAttributes)
            {
                ColumnAttribute firstCustomAttribute = customAttributes.First();

                string columnAttribute = firstCustomAttribute.Name;
                table.Columns.Add(columnAttribute,
                    Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType);
                continue;
            }

            table.Columns.Add(prop.Name, Nullable.GetUnderlyingType(prop.PropertyType) ?? prop.PropertyType);
        }

        foreach (T item in data)
        {
            DataRow row = table.NewRow();
            foreach (PropertyDescriptor prop in properties)
            {
                if (ignoreColumnsNames.Contains(prop.Name))
                {
                    continue;
                }
                AttributeCollection attributes1 = prop.Attributes;
                var customAttributes = attributes1.OfType<ColumnAttribute>();
                bool hasCustomAttributes = customAttributes.Any();
                if (hasCustomAttributes)
                {
                    ColumnAttribute firstCustomAttribute = customAttributes.First();

                    string columnAttribute = firstCustomAttribute.Name;
                    row[columnAttribute] = prop.GetValue(item) ?? DBNull.Value;

                    continue;
                }
                row[prop.Name] = prop.GetValue(item) ?? DBNull.Value;
            }
            table.Rows.Add(row);
        }

        return table;
    }


    private static List<string> GetIgnoreAndResultColumnsNames<T>()
    {
        var ignoreColumnsNames = new List<string>();

        PropertyInfo[] props = typeof(T).GetProperties();
        foreach (PropertyInfo prop in props)
        {
            IgnoreAttribute ignoreAttr = prop.GetCustomAttribute<IgnoreAttribute>(true);
            if (ignoreAttr != null)
            {
                ignoreColumnsNames.Add(prop.Name);
                continue;
            }

            ResultColumnAttribute resultAttr = prop.GetCustomAttribute<ResultColumnAttribute>(true);
            if (resultAttr != null)
            {
                ignoreColumnsNames.Add(prop.Name);
            }
        }

        return ignoreColumnsNames;
    }
}