namespace Magav.Common.Extensions;

public static class EnumerableExtensions
{
    public static bool IsEmpty<T>(this IEnumerable<T>? source)
    {
        return source == null || !source.GetEnumerator().MoveNext();
    }

    public static bool IsEmpty<T>(this List<T>? list)
    {
        return list == null || list.Count == 0;
    }

    public static bool IsNotEmpty<T>(this List<T>? list)
    {
        return list is { Count: > 0 };
    }

    public static bool IsEmpty<T>(this T[]? array)
    {
        return array == null || array.Length == 0;
    }

    public static bool IsNotEmpty<T>(this T[]? array)
    {
        return array is { Length: > 0 };
    }

    public static bool IsNotEmpty<T>(this HashSet<T>? hashSet)
    {
        return hashSet != null && hashSet.Count > 0;
    }

    public static bool IsNullOrEmpty(this string str)
    {
        return string.IsNullOrEmpty(str);
    }

    public static bool IsNotNullOrEmpty(this string str)
    {
        return !string.IsNullOrEmpty(str);
    }

    public static void ForEach<T>(this IEnumerable<T> enumeration, Action<T> action)
    {
        foreach (T item in enumeration)
        {
            action(item);
        }
    }

    public static T[] Concat<T>(this T[] array, T element)
    {
        T[] result = new T[array.Length + 1];
        array.CopyTo(result, 0);
        result[array.Length] = element;
        return result;
    }

    public static void Concat<TKey, TValue>(this Dictionary<TKey, TValue> dictionary, Dictionary<TKey, TValue> dictionaryToBeConcat)
    {
        dictionaryToBeConcat.ToList().ForEach(kvp => dictionary.TryAdd(kvp.Key, kvp.Value));
    }
}