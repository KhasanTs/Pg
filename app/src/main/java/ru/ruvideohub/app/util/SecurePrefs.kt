package ru.ruvideohub.app.util

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Хранит API-ключи, токены и адреса источников в зашифрованном виде
 * (AES256-GCM через Android Keystore), а не в открытых SharedPreferences.
 *
 * Если по какой-то причине (нестандартная прошивка, сбой Keystore) шифрование
 * не удаётся инициализировать — откатываемся на обычный SharedPreferences,
 * чтобы приложение не падало, но пишем предупреждение в лог.
 */
object SecurePrefs {
    private const val FILE_NAME = "ruvideohub_secure"
    private const val TAG = "SecurePrefs"

    fun get(context: Context): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.w(TAG, "Не удалось инициализировать шифрованное хранилище, использую обычное", e)
            context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
        }
    }
}
