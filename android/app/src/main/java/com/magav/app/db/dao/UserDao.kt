package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.UserEntity

@Dao
interface UserDao {

    @Query("SELECT * FROM Users")
    suspend fun getAll(): List<UserEntity>

    @Query("SELECT * FROM Users WHERE Id = :id")
    suspend fun getById(id: Int): UserEntity?

    @Query("SELECT * FROM Users WHERE UserName = :userName")
    suspend fun getByUserName(userName: String): UserEntity?

    @Query("SELECT * FROM Users WHERE RefreshTokenHash = :hash")
    suspend fun getByRefreshTokenHash(hash: String): UserEntity?

    @Query("SELECT * FROM Users WHERE Role = :role")
    suspend fun getByRole(role: String): List<UserEntity>

    @Query("SELECT COUNT(*) FROM Users WHERE UserName = :userName")
    suspend fun countByUserName(userName: String): Int

    @Query("SELECT COUNT(*) FROM Users WHERE Role = :role")
    suspend fun countByRole(role: String): Int

    @Insert
    suspend fun insert(user: UserEntity): Long

    @Update
    suspend fun update(user: UserEntity)

    @Delete
    suspend fun delete(user: UserEntity)
}
