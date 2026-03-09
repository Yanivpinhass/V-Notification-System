package com.magav.app.service

import at.favre.lib.crypto.bcrypt.BCrypt
import com.magav.app.api.auth.JwtConfig
import com.magav.app.api.models.LoginResponse
import com.magav.app.api.models.UserInfo
import com.magav.app.db.dao.UserDao
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

class AuthService(private val userDao: UserDao) {

    companion object {
        private const val MAX_FAILED_ATTEMPTS = 5
        private const val LOCKOUT_MINUTES = 15L
        private const val MIN_PASSWORD_LENGTH = 6
    }

    private val isoFormatter: DateTimeFormatter =
        DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC)

    suspend fun login(username: String, password: String): LoginResponse {
        val user = userDao.getByUserName(username)
            ?: throw IllegalArgumentException("שם משתמש או סיסמה שגויים")

        if (user.isActive != 1) {
            throw IllegalArgumentException("המשתמש אינו פעיל")
        }

        // Check lockout
        user.lockoutUntil?.let { lockoutStr ->
            val lockoutUntil = Instant.parse(lockoutStr)
            if (Instant.now().isBefore(lockoutUntil)) {
                throw IllegalArgumentException("החשבון נעול. נסה שוב מאוחר יותר")
            }
        }

        // Verify password
        val verified = BCrypt.verifyer()
            .verify(password.toCharArray(), user.passwordHash)
            .verified

        if (!verified) {
            val newAttempts = user.failedLoginAttempts + 1
            val now = isoFormatter.format(Instant.now())

            if (newAttempts >= MAX_FAILED_ATTEMPTS) {
                val lockoutUntil = isoFormatter.format(
                    Instant.now().plusSeconds(LOCKOUT_MINUTES * 60)
                )
                userDao.update(
                    user.copy(
                        failedLoginAttempts = newAttempts,
                        lockoutUntil = lockoutUntil,
                        updatedAt = now
                    )
                )
                throw IllegalArgumentException("החשבון ננעל עקב ניסיונות כושלים מרובים")
            } else {
                userDao.update(
                    user.copy(
                        failedLoginAttempts = newAttempts,
                        updatedAt = now
                    )
                )
                throw IllegalArgumentException("שם משתמש או סיסמה שגויים")
            }
        }

        // Successful login — reset attempts, update last connected
        val now = isoFormatter.format(Instant.now())
        val accessToken = JwtConfig.generateAccessToken(user.id, user.fullName, user.role)
        val refreshToken = JwtConfig.generateRefreshToken()
        val refreshTokenHash = hashSha256(refreshToken)
        val refreshTokenExpiry = isoFormatter.format(JwtConfig.getRefreshTokenExpiresAt().toInstant())

        userDao.update(
            user.copy(
                failedLoginAttempts = 0,
                lockoutUntil = null,
                lastConnected = now,
                refreshTokenHash = refreshTokenHash,
                refreshTokenExpiry = refreshTokenExpiry,
                updatedAt = now
            )
        )

        return LoginResponse(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAt = JwtConfig.getExpiresAt(),
            user = UserInfo(
                id = user.id.toString(),
                name = user.fullName,
                roles = listOf(user.role)
            ),
            mustChangePassword = user.mustChangePassword == 1
        )
    }

    suspend fun refreshToken(refreshToken: String): LoginResponse {
        val hash = hashSha256(refreshToken)
        val user = userDao.getByRefreshTokenHash(hash)
            ?: throw IllegalArgumentException("טוקן לא תקף")

        // Check expiry
        user.refreshTokenExpiry?.let { expiryStr ->
            val expiry = Instant.parse(expiryStr)
            if (Instant.now().isAfter(expiry)) {
                // Clear expired token
                val now = isoFormatter.format(Instant.now())
                userDao.update(
                    user.copy(
                        refreshTokenHash = null,
                        refreshTokenExpiry = null,
                        updatedAt = now
                    )
                )
                throw IllegalArgumentException("טוקן פג תוקף")
            }
        } ?: throw IllegalArgumentException("טוקן לא תקף")

        // Rotate tokens
        val now = isoFormatter.format(Instant.now())
        val newAccessToken = JwtConfig.generateAccessToken(user.id, user.fullName, user.role)
        val newRefreshToken = JwtConfig.generateRefreshToken()
        val newRefreshTokenHash = hashSha256(newRefreshToken)
        val newRefreshTokenExpiry = isoFormatter.format(JwtConfig.getRefreshTokenExpiresAt().toInstant())

        userDao.update(
            user.copy(
                refreshTokenHash = newRefreshTokenHash,
                refreshTokenExpiry = newRefreshTokenExpiry,
                lastConnected = now,
                updatedAt = now
            )
        )

        return LoginResponse(
            accessToken = newAccessToken,
            refreshToken = newRefreshToken,
            expiresAt = JwtConfig.getExpiresAt(),
            user = UserInfo(
                id = user.id.toString(),
                name = user.fullName,
                roles = listOf(user.role)
            ),
            mustChangePassword = user.mustChangePassword == 1
        )
    }

    suspend fun logout(userId: Int) {
        val user = userDao.getById(userId) ?: return
        val now = isoFormatter.format(Instant.now())
        userDao.update(
            user.copy(
                refreshTokenHash = null,
                refreshTokenExpiry = null,
                updatedAt = now
            )
        )
    }

    suspend fun changePassword(userId: Int, newPassword: String) {
        if (newPassword.length < 4) {
            throw IllegalArgumentException("הסיסמה חייבת להכיל לפחות 4 תווים")
        }

        val user = userDao.getById(userId)
            ?: throw IllegalArgumentException("משתמש לא נמצא")

        val now = isoFormatter.format(Instant.now())
        val newHash = BCrypt.withDefaults().hashToString(10, newPassword.toCharArray())

        userDao.update(
            user.copy(
                passwordHash = newHash,
                mustChangePassword = 0,
                updatedAt = now
            )
        )
    }

    private fun hashSha256(input: String): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}
