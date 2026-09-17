package ru.ruvideohub.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ru.ruvideohub.app.ui.App
import ru.ruvideohub.app.util.SecurePrefs

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = SecurePrefs.get(this)
        setContent { App(prefs, this) }
    }
}
