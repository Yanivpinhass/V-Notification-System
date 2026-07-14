package com.magav.app.util

object ReminderTypes {
    const val SAME_DAY = "SameDay"
    const val ADVANCE = "Advance"
    const val LOCATION_UPDATE = "LocationUpdate"
    const val MANUAL = "Manual"
    const val WEEKDAY_ADVANCE = "WeekdayAdvance"
    const val ADMIN_ADVANCE = "AdminAdvance"
}

object ShiftTypes {
    const val OPERATIONAL = "Operational"
    const val ADMINISTRATIVE = "Administrative"
}

object LocationTypes {
    const val VEHICLE = "Vehicle"
    const val GENERAL = "General"
}

// AppSettings keys (administrative-shifts template roles — D5). NOT part of the parity-lint value-sets,
// but MUST match the .NET MagavConstants.AppSettingsKeys literals exactly.
object AppSettingsKeys {
    const val ADMIN_ASSIGNMENT_TEMPLATE_ID = "admin_assignment_template_id"
    const val ADMIN_TODAY_TEMPLATE_ID = "admin_today_template_id"
}

object SmsStatuses {
    const val SUCCESS = "Success"
    const val FAIL = "Fail"
}

object DayGroups {
    const val SUN_THU = "SunThu"
    const val FRI = "Fri"
    const val SAT = "Sat"
}
