using System.Collections;
using System.Collections.ObjectModel;
using System.Data;
using System.Diagnostics.CodeAnalysis;

namespace Magav.Common.Helpers
{
    public class IndexedList<T>
    {
        private readonly ReaderWriterLockSlim _rwLock = new ReaderWriterLockSlim();

        private readonly Dictionary<string, IDictionary> _dictionaries
            = new Dictionary<string, IDictionary>();

        private readonly List<Action<T>> _insertActions = new List<Action<T>>();
        private readonly List<Func<T, bool>> _removeActions = new List<Func<T, bool>>();

        private readonly List<T> _list;

        public ReadOnlyCollection<T> List { get; }

        public IndexedList(List<T> list)
        {
            _list = list;
            List = list.AsReadOnly();
        }

        public IndexedList() : this(new List<T>())
        {
        }

        public void Index<TProperty>(string propertyName, Func<T, TProperty> propGetter)
        {
            _rwLock.EnterWriteLock();
            try
            {
                DoIndex(propertyName, propGetter);
            }
            finally
            {
                _rwLock.ExitWriteLock();
            }
        }

        private void DoIndex<TProperty>(string propertyName, Func<T, TProperty> propGetter)
        {
            if (_dictionaries.ContainsKey(propertyName))
            {
                throw new DuplicateNameException($"Index with the name '{propertyName}' already exists");
            }

            Dictionary<TProperty, List<T>> dictionary = List.ToLookup(propGetter).ToDictionary(item => item.Key, item => item.ToList());
            _dictionaries.TryAdd(propertyName, dictionary);

            _insertActions.Add((item) => AddToDictionary(propertyName, propGetter, item));
            _removeActions.Add((item) => RemoveFromDictionary(propertyName, propGetter, item));
        }

        public void Add(T item)
        {
            _rwLock.EnterWriteLock();
            try
            {
                _insertActions.ForEach(action => action(item));
                _list.Add(item);
            }
            finally
            {
                _rwLock.ExitWriteLock();
            }
        }

        public bool RemoveItem(T item)
        {
            _rwLock.EnterWriteLock();
            try
            {
                bool res = _removeActions.Select(removeFunc => removeFunc(item)).All(result => true);
                _list.Remove(item);
                return res;
            }
            finally
            {
                _rwLock.ExitWriteLock();
            }
        }

        private void AddToDictionary<TProperty>(string propertyName, Func<T, TProperty> propGetter, T item)
        {
            bool succeeded = _dictionaries.TryGetValue(propertyName, out var dictionary);
            if (!succeeded)
                throw new ApplicationException($"Can't find the index: {propertyName}");


            var typeSafeDictionary = (Dictionary<TProperty, List<T>>)dictionary;
            TProperty propertyValue = propGetter(item);
            succeeded = typeSafeDictionary.TryGetValue(propertyValue, out var list);
            if (!succeeded)
            {
                list = new List<T>();
                typeSafeDictionary.TryAdd(propertyValue, list);
            }

            list.Add(item);
        }

        private bool RemoveFromDictionary<TProperty>(string propertyName, Func<T, TProperty> propGetter, T item)
        {
            bool succeeded = _dictionaries.TryGetValue(propertyName, out var dictionary);
            if (!succeeded)
                throw new ApplicationException($"Can't find the index: {propertyName}");


            var typeSafeDictionary = (Dictionary<TProperty, List<T>>)dictionary;
            TProperty propertyValue = propGetter(item);
            succeeded = typeSafeDictionary.TryGetValue(propertyValue, out var list);
            if (!succeeded)
            {
                return false;
            }

            return list.Remove(item);
        }


        public void Index<TProperty1, TProperty2>(string indexName, [NotNull] Func<T, TProperty1> propGetter1, [NotNull] Func<T, TProperty2> propGetter2)
        {
            Func<T, Tuple<TProperty1, TProperty2>> combinedPropGetter = (item) => Tuple.Create(propGetter1(item), propGetter2(item));
            Index(indexName, combinedPropGetter);
        }

        public void Index<TProperty1, TProperty2, TProperty3>(string indexName, [NotNull] Func<T, TProperty1> propGetter1, [NotNull] Func<T, TProperty2> propGetter2, [NotNull] Func<T, TProperty3> propGetter3)
        {
            Func<T, Tuple<TProperty1, TProperty2, TProperty3>> combinedPropGetter = (item) => Tuple.Create(propGetter1(item), propGetter2(item), propGetter3(item));
            Index(indexName, combinedPropGetter);
        }

        public void Index<TProperty1, TProperty2, TProperty3, TProperty4>(string indexName, [NotNull] Func<T, TProperty1> propGetter1, [NotNull] Func<T, TProperty2> propGetter2, [NotNull] Func<T, TProperty3> propGetter3, [NotNull] Func<T, TProperty4> propGetter4)
        {
            Func<T, Tuple<TProperty1, TProperty2, TProperty3, TProperty4>> combinedPropGetter = (item) => Tuple.Create(propGetter1(item), propGetter2(item), propGetter3(item), propGetter4(item));
            Index(indexName, combinedPropGetter);
        }

        public void Index<TProperty1, TProperty2, TProperty3, TProperty4, TProperty5>(string indexName, [NotNull] Func<T, TProperty1> propGetter1, [NotNull] Func<T, TProperty2> propGetter2, [NotNull] Func<T, TProperty3> propGetter3, [NotNull] Func<T, TProperty4> propGetter4, [NotNull] Func<T, TProperty5> propGetter5)
        {
            Func<T, Tuple<TProperty1, TProperty2, TProperty3, TProperty4, TProperty5>> combinedPropGetter = (item) => Tuple.Create(propGetter1(item), propGetter2(item), propGetter3(item), propGetter4(item), propGetter5(item));
            Index(indexName, combinedPropGetter);
        }

        public void Index<TProperty1, TProperty2, TProperty3, TProperty4, TProperty5, TProperty6>(string indexName, [NotNull] Func<T, TProperty1> propGetter1, [NotNull] Func<T, TProperty2> propGetter2, [NotNull] Func<T, TProperty3> propGetter3, [NotNull] Func<T, TProperty4> propGetter4, [NotNull] Func<T, TProperty5> propGetter5, [NotNull] Func<T, TProperty6> propGetter6)
        {
            Func<T, Tuple<TProperty1, TProperty2, TProperty3, TProperty4, TProperty5, TProperty6>> combinedPropGetter = (item) => Tuple.Create(propGetter1(item), propGetter2(item), propGetter3(item), propGetter4(item), propGetter5(item), propGetter6(item));
            Index(indexName, combinedPropGetter);
        }

        public T GetFirstByProperty<TElement>(string propertyName, TElement propertyValue)
        {
            return GetByProperty(propertyName, propertyValue).FirstOrDefault();
        }

        public T GetFirstByProperties<TElement1, TElement2>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2)
        {
            return GetByProperties(indexName, propertyValue1, propertyValue2).FirstOrDefault();
        }

        public T GetFirstByProperties<TElement1, TElement2, TElement3>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, bool allowKeyMiss = false)
        {
            List<T> items = GetByProperties(indexName, propertyValue1, propertyValue2, propertyValue3, allowKeyMiss);
            return items != null && items.Count != 0 ? items.FirstOrDefault() : default;
        }

        public T GetFirstByProperties<TElement1, TElement2, TElement3, TElement4, TElement5>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, TElement4 propertyValue4, bool allowKeyMiss = false)
        {
            List<T> items = GetByProperties(indexName, propertyValue1, propertyValue2, propertyValue3, propertyValue4, allowKeyMiss);
            return items != null && items.Count != 0 ? items.FirstOrDefault() : default;
        }

        public T GetFirstByProperties<TElement1, TElement2, TElement3, TElement4, TElement5>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, TElement4 propertyValue4, TElement5 propertyValue5, bool allowKeyMiss = false)
        {
            return GetByProperties(indexName, propertyValue1, propertyValue2, propertyValue3, propertyValue4, propertyValue5, allowKeyMiss = false).FirstOrDefault();
        }

        public List<T> GetByProperty<TElement>(string propertyName, TElement propertyValue, bool allowKeyMiss = false)
        {
            _rwLock.EnterReadLock();
            try
            {
                return DoGetByProperty(propertyName, propertyValue, allowKeyMiss);
            }
            finally
            {
                _rwLock.ExitReadLock();
            }
        }

        private List<T> DoGetByProperty<TElement>(string propertyName, TElement propertyValue, bool allowKeyMiss)
        {
            bool succeeded = _dictionaries.TryGetValue(propertyName, out var dictionary);
            if (!succeeded)
            {
                if (allowKeyMiss)
                    return new List<T>();

                throw new ApplicationException($"Can't find the index {propertyName}");
            }


            var typeSafeDictionary = (Dictionary<TElement, List<T>>)dictionary;

            succeeded = typeSafeDictionary.TryGetValue(propertyValue, out var result);

            return succeeded ? result : null;
        }

        public List<T> GetByProperties<TElement1, TElement2>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, bool allowKeyMiss = false)
        {
            return GetByProperty(indexName, Tuple.Create(propertyValue1, propertyValue2), allowKeyMiss);
        }

        public List<T> GetByProperties<TElement1, TElement2, TElement3>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, bool allowKeyMiss = false)
        {
            return GetByProperty(indexName, Tuple.Create(propertyValue1, propertyValue2, propertyValue3), allowKeyMiss);
        }

        public List<T> GetByProperties<TElement1, TElement2, TElement3, TElement4>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, TElement4 propertyValue4, bool allowKeyMiss = false)
        {
            return GetByProperty(indexName, Tuple.Create(propertyValue1, propertyValue2, propertyValue3, propertyValue4), allowKeyMiss);
        }

        public List<T> GetByProperties<TElement1, TElement2, TElement3, TElement4, TElement5>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, TElement4 propertyValue4, TElement5 propertyValue5, bool allowKeyMiss = false)
        {
            return GetByProperty(indexName, Tuple.Create(propertyValue1, propertyValue2, propertyValue3, propertyValue4, propertyValue5), allowKeyMiss);
        }

        public List<T> GetByProperties<TElement1, TElement2, TElement3, TElement4, TElement5, TElement6>(string indexName, TElement1 propertyValue1, TElement2 propertyValue2, TElement3 propertyValue3, TElement4 propertyValue4, TElement5 propertyValue5, TElement6 propertyValue6, bool allowKeyMiss = false)
        {
            return GetByProperty(indexName, Tuple.Create(propertyValue1, propertyValue2, propertyValue3, propertyValue4, propertyValue5, propertyValue6), allowKeyMiss);
        }
    }
}
