namespace Magav.Common.Utils;

public static class DateTimeHelper
{
    public static List<DateTime> GetDatesForDayOfWeek(DateTime fromDate, DateTime toDate, int dayOfWeek)
    {
        var dates = new List<DateTime>();

        if (fromDate > toDate)
        {
            throw new Exception("from date cannot be bigger then toDate!");
        }

        DateTime current = fromDate;

        int daysUntilTargetDay = (dayOfWeek - (int)current.DayOfWeek + 7) % 7;

        if (daysUntilTargetDay == 0 && (int)current.DayOfWeek != dayOfWeek)
        {
            throw new Exception("The same day in new Date!");
        }

        current = current.AddDays(daysUntilTargetDay);

        while (current <= toDate)
        {
            dates.Add(current);
            current = current.AddDays(7);
        }

        return dates;
    }
}
