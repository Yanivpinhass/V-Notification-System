using NPoco;
using System.Reflection;
using Magav.Common.Attributes;

namespace Magav.Common.Extensions
{
    public static class ReflectionExtensions
    {
        public static TType CastType<TType>(this object source)
        {
            TType res = Activator.CreateInstance<TType>();

            Type sourceType = source.GetType();
            Type destinationType = res.GetType();

            foreach (var destinationProp in destinationType.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var sourceProp = sourceType.GetProperty(destinationProp.Name);
                if (sourceProp != null && destinationProp.CanWrite)
                {
                    destinationProp.SetValue(res, sourceProp.GetValue(source));
                }
            }

            return res;
        }

        public static bool IsEqual<T>(T item, T itemToCompare)
        {
            PropertyInfo[] itemProperties = item.GetType().GetProperties(BindingFlags.Instance
                                                                         | BindingFlags.Public
                                                                         | BindingFlags.GetProperty
                                                                         | BindingFlags.FlattenHierarchy);
            var itemToCompareProperties = itemToCompare.GetType()
                .GetProperties(BindingFlags.Instance | BindingFlags.Public | BindingFlags.GetProperty | BindingFlags.FlattenHierarchy)
                .ToDictionary(p => p.Name, p => p);

            foreach (PropertyInfo property in itemProperties)
            {
                if (!itemToCompareProperties.TryGetValue(property.Name, out var property2))
                    throw new ApplicationException($"Failed to find matching property. " +
                                                   $"SourceItem: '{item.GetType().Name}', ItemToCompare '{itemToCompare.GetType().Name}'");

                object value = property.GetValue(item);
                object valueToCompare = property2.GetValue(itemToCompare);

                if (value != null && !value.Equals(valueToCompare))
                    return false;
                if (value == null && valueToCompare != null)
                    return false;
            }

            return true;
        }
        
        public static string GetPropertyOrColumnName(PropertyInfo propertyInfo)
        {
            ColumnAttribute? attribute = propertyInfo.GetCustomAttribute<ColumnAttribute>();
            return attribute != null ? attribute.Name : propertyInfo.Name;
        }

        public static string GetHebrewDescription(PropertyInfo propertyInfo)
        {
            HebrewDescriptionAttribute? hebrewAttribute = propertyInfo.GetCustomAttribute<HebrewDescriptionAttribute>();
            if (hebrewAttribute != null)
                return hebrewAttribute.Description;

            // Fallback to DisplayName attribute if exists
            System.ComponentModel.DisplayNameAttribute? displayNameAttribute = propertyInfo.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
            if (displayNameAttribute != null)
                return displayNameAttribute.DisplayName;

            // Final fallback to property name
            return propertyInfo.Name;
        }

        public static string GetHebrewDescription(this Enum enumValue)
        {
            FieldInfo? fieldInfo = enumValue.GetType().GetField(enumValue.ToString());
            if (fieldInfo == null)
                return enumValue.ToString();

            HebrewDescriptionAttribute? hebrewAttribute = fieldInfo.GetCustomAttribute<HebrewDescriptionAttribute>();
            if (hebrewAttribute != null)
                return hebrewAttribute.Description;

            // Fallback to DisplayName attribute if exists
            System.ComponentModel.DisplayNameAttribute? displayNameAttribute = fieldInfo.GetCustomAttribute<System.ComponentModel.DisplayNameAttribute>();
            if (displayNameAttribute != null)
                return displayNameAttribute.DisplayName;

            // Final fallback to enum value name
            return enumValue.ToString();
        }

        public static List<PropertyValueDifferences> GetNotEqualProperties<T>(T item, T itemToCompare)
        {
            var differences = new List<PropertyValueDifferences>();
            PropertyInfo[] itemProperties = item.GetType().GetProperties(BindingFlags.Instance
                                                                         | BindingFlags.Public
                                                                         | BindingFlags.GetProperty
                                                                         | BindingFlags.FlattenHierarchy);
            var itemToCompareProperties = itemToCompare.GetType()
                .GetProperties(BindingFlags.Instance | BindingFlags.Public | BindingFlags.GetProperty | BindingFlags.FlattenHierarchy)
                .ToDictionary(p => p.Name, p => p);

            foreach (PropertyInfo property in itemProperties)
            {
                if (!itemToCompareProperties.TryGetValue(property.Name, out var property2))
                {
                    continue;
                }

                Attribute customAttribute = property.GetCustomAttribute(typeof(IgnoreOnCompareAttribute));
                if (customAttribute != null)
                    continue;

                object value = property.GetValue(item);
                object valueToCompare = property2.GetValue(itemToCompare);

                if (value != null && !value.Equals(valueToCompare))
                {
                    if (property.PropertyType.IsGenericType && property.PropertyType.GenericTypeArguments[0] == typeof(DateTime))
                    {
                        if (value.ToString() == valueToCompare?.ToString())
                        {
                            continue;
                        }
                    }

                    differences.Add(new PropertyValueDifferences
                    {
                        PropertyInfo = property,
                        Value = value,
                        EntityToCompareValue = valueToCompare
                    });
                }
                else if (value == null && valueToCompare != null)
                {
                    differences.Add(new PropertyValueDifferences
                    {
                        PropertyInfo = property,
                        EntityToCompareValue = valueToCompare
                    });
                }
            }

            return differences;
        }
        
        public class PropertyValueDifferences
        {
            public PropertyInfo PropertyInfo { get; set; }

            public object Value { get; set; }

            public object EntityToCompareValue { get; set; }
        }
    }
}
