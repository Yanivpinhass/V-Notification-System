package com.magav.app.api.models

import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val message: String? = null,
    val data: T? = null,
    val errors: List<String>? = null
) {
    companion object {
        fun <T> ok(data: T, message: String? = null) =
            ApiResponse(success = true, data = data, message = message)

        fun <T> fail(error: String) =
            ApiResponse<T>(success = false, message = error)

        fun <T> fail(errors: List<String>) =
            ApiResponse<T>(success = false, errors = errors)
    }
}
