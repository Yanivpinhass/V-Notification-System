package com.magav.app.api.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.auth0.jwt.interfaces.DecodedJWT
import java.security.SecureRandom
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.UUID

object JwtConfig {
    private const val ISSUER = "magav-app"
    private const val AUDIENCE = "magav-users"
    private const val ACCESS_TOKEN_EXPIRY_MINUTES = 15L
    private const val REFRESH_TOKEN_EXPIRY_DAYS = 3L

    private var secretKey: String = ""

    fun initialize(key: String) {
        secretKey = key
    }

    fun generateAccessToken(userId: Int, fullName: String, role: String): String {
        val now = Instant.now()
        val expiresAt = now.plusSeconds(ACCESS_TOKEN_EXPIRY_MINUTES * 60)

        return JWT.create()
            .withSubject(userId.toString())
            .withClaim("name", fullName)
            .withClaim("role", role)
            .withClaim("jti", UUID.randomUUID().toString())
            .withIssuer(ISSUER)
            .withAudience(AUDIENCE)
            .withIssuedAt(Date.from(now))
            .withExpiresAt(Date.from(expiresAt))
            .sign(Algorithm.HMAC256(secretKey))
    }

    fun generateRefreshToken(): String {
        val random = SecureRandom()
        val bytes = ByteArray(64)
        random.nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    fun verifyAccessToken(token: String): DecodedJWT? {
        return try {
            JWT.require(Algorithm.HMAC256(secretKey))
                .withIssuer(ISSUER)
                .withAudience(AUDIENCE)
                .build()
                .verify(token)
        } catch (_: Exception) {
            null
        }
    }

    fun getExpiresAt(): String {
        val expiresAt = Instant.now().plusSeconds(ACCESS_TOKEN_EXPIRY_MINUTES * 60)
        return DateTimeFormatter.ISO_INSTANT
            .withZone(ZoneOffset.UTC)
            .format(expiresAt)
    }

    fun getRefreshTokenExpiresAt(): Date {
        val expiresAt = Instant.now().plusSeconds(REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60)
        return Date.from(expiresAt)
    }
}
