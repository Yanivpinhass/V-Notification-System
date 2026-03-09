using NPoco;

namespace Magav.Common.Extensions;

public static class EntityExtensions
{
    public static string GetTableName<T>()
    {
        object[] customAttributes = typeof(T).GetCustomAttributes(typeof(TableNameAttribute), false);
        if (customAttributes.Length > 0)
        {
            return ((TableNameAttribute)customAttributes[0]).Value;
        }
        return typeof(T).Name;
    }
}