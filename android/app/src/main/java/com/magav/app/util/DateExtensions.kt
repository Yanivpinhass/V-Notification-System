package com.magav.app.util

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

fun LocalDate.toIsoInstant(): String =
    this.atStartOfDay(ZoneOffset.UTC).format(DateTimeFormatter.ISO_INSTANT)

fun LocalDate.toIsoRange(): Pair<String, String> =
    Pair(this.toIsoInstant(), this.plusDays(1).toIsoInstant())
