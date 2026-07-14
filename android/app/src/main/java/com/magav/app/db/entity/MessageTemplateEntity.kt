package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "MessageTemplate")
data class MessageTemplateEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "Name")
    val name: String,

    @ColumnInfo(name = "Content")
    val content: String,

    @ColumnInfo(name = "CreatedAt")
    val createdAt: String? = null,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null
)
