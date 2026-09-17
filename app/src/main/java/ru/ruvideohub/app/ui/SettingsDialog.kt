package ru.ruvideohub.app.ui

import android.content.SharedPreferences
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SettingsDialog(prefs: SharedPreferences, onClose: () -> Unit) {
    var vkToken by remember { mutableStateOf(prefs.getString("vk_token", "").orEmpty()) }
    var kpKey by remember { mutableStateOf(prefs.getString("kp_key", "").orEmpty()) }

    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Настройки") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "RUTUBE и MAIL.RU работают без ключей. Для поиска VK нужен ваш access_token. " +
                        "Kinopoisk API key используется только для дополнительных данных, если они подключены в проекте.",
                    fontSize = 12.sp
                )
                OutlinedTextField(
                    value = vkToken,
                    onValueChange = { vkToken = it },
                    singleLine = true,
                    label = { Text("VK access_token") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = kpKey,
                    onValueChange = { kpKey = it },
                    singleLine = true,
                    label = { Text("Kinopoisk API key") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                prefs.edit()
                    .putString("vk_token", vkToken.trim())
                    .putString("kp_key", kpKey.trim())
                    .apply()
                onClose()
            }) { Text("Сохранить") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Закрыть") } }
    )
}
