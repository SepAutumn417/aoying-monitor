package com.aoying.aoying_monitor.monitor

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.aoying.aoying_monitor.pure.AuthFailure
import com.aoying.aoying_monitor.pure.Session
import com.aoying.aoying_monitor.pure.SessionStore
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM key is non-exportable AndroidKeyStore material; only ciphertext enters preferences. */
class EncryptedSessionStore(context: Context) : SessionStore {
    private val prefs = context.getSharedPreferences("native_secure_session", Context.MODE_PRIVATE)
    private val alias = "aoying.monitor.session.v1"
    private val aad = "aoying.native.session.v1".toByteArray(Charsets.UTF_8)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
            generateKey()
        }
    }
    @Synchronized override fun load(): Session? {
        val value = prefs.getString("encrypted", null) ?: return null
        try {
            val data = JSONObject(value)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(data.getString("iv"), Base64.NO_WRAP)))
            cipher.updateAAD(aad)
            val plain = JSONObject(String(cipher.doFinal(Base64.decode(data.getString("body"), Base64.NO_WRAP)), Charsets.UTF_8))
            return sessionFromJson(plain.getString("origin"), plain)
        } catch (_: Exception) {
            clear()
            throw AuthFailure("secure_storage_failed")
        }
    }
    @Synchronized override fun save(session: Session) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(aad)
        val encrypted = cipher.doFinal(session.asJson().toString().toByteArray(Charsets.UTF_8))
        val value = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .put("body", Base64.encodeToString(encrypted, Base64.NO_WRAP)).toString()
        if (!prefs.edit().putString("encrypted", value).commit()) throw AuthFailure("secure_storage_failed")
    }
    @Synchronized override fun clear() {
        if (!prefs.edit().clear().commit()) throw AuthFailure("secure_storage_failed")
    }
}
