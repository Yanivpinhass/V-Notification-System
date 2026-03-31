package com.magav.app.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.magav.app.db.dao.AppSettingDao
import com.magav.app.db.dao.MessageTemplateDao
import com.magav.app.db.dao.SchedulerConfigDao
import com.magav.app.db.dao.SchedulerRunLogDao
import com.magav.app.db.dao.ShiftDao
import com.magav.app.db.dao.SmsLogDao
import com.magav.app.db.dao.UserDao
import com.magav.app.db.dao.VolunteerDao
import com.magav.app.db.entity.AppSettingEntity
import com.magav.app.db.entity.MessageTemplateEntity
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.SchedulerRunLogEntity
import com.magav.app.db.entity.ShiftEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.db.entity.UserEntity
import com.magav.app.db.entity.VolunteerEntity

@Database(
    entities = [
        UserEntity::class,
        VolunteerEntity::class,
        ShiftEntity::class,
        SmsLogEntity::class,
        SchedulerConfigEntity::class,
        SchedulerRunLogEntity::class,
        AppSettingEntity::class,
        MessageTemplateEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class MagavDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun volunteerDao(): VolunteerDao
    abstract fun shiftDao(): ShiftDao
    abstract fun smsLogDao(): SmsLogDao
    abstract fun schedulerConfigDao(): SchedulerConfigDao
    abstract fun schedulerRunLogDao(): SchedulerRunLogDao
    abstract fun appSettingDao(): AppSettingDao
    abstract fun messageTemplateDao(): MessageTemplateDao

    companion object {
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE Shifts_new (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        ShiftDate TEXT NOT NULL,
                        ShiftName TEXT NOT NULL,
                        CarId TEXT NOT NULL DEFAULT '',
                        VolunteerId INTEGER,
                        VolunteerName TEXT,
                        SmsSentAt TEXT,
                        CreatedAt TEXT,
                        UpdatedAt TEXT,
                        FOREIGN KEY (VolunteerId) REFERENCES Volunteers(Id) ON DELETE CASCADE
                    )
                """.trimIndent())
                db.execSQL("""
                    INSERT INTO Shifts_new (Id, ShiftDate, ShiftName, CarId, VolunteerId, SmsSentAt, CreatedAt, UpdatedAt)
                    SELECT Id, ShiftDate, ShiftName, CarId, VolunteerId, SmsSentAt, CreatedAt, UpdatedAt FROM Shifts
                """.trimIndent())
                db.execSQL("DROP TABLE Shifts")
                db.execSQL("ALTER TABLE Shifts_new RENAME TO Shifts")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_Shifts_ShiftDate ON Shifts(ShiftDate)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_Shifts_VolunteerId ON Shifts(VolunteerId)")
            }
        }
    }
}
