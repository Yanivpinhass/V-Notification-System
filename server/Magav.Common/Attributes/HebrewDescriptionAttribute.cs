using System;

namespace Magav.Common.Attributes
{
    [AttributeUsage(AttributeTargets.Property | AttributeTargets.Field)]
    public class HebrewDescriptionAttribute : Attribute
    {
        public string Description { get; }

        public HebrewDescriptionAttribute(string description)
        {
            Description = description;
        }
    }
}