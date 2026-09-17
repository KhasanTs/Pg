package ru.ruvideohub.app.ui

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ActivityInfo
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.state.MainState

@Composable
fun App(
    prefs: SharedPreferences,
    activity: ComponentActivity
) {
    var settingsOpen by remember { mutableStateOf(false) }
    val state = remember { MainState(prefs) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
    }

    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFFD00000),
            secondary = Color(0xFF555B66),
            background = Color(0xFFF7F7F8),
            surface = Color.White,
            surfaceVariant = Color(0xFFEDEEF1)
        )
    ) {
        if (state.selected != null) {
            DetailsScreen(
                movie = state.selected!!,
                tv = true,
                favorite = state.favorites.contains(state.selected!!.id),
                loading = state.loading,
                onBack = { state.selected = null },
                onFavorite = { state.toggleFavorite() },
                onPlayExternal = { option -> playExternal(context, option) }
            )
        } else {
            HomeScreen(
                state = state,
                onOpen = { scope.launch { state.open(it) } },
                onSearch = { scope.launch { state.search() } },
                onSettings = { settingsOpen = true },
                onSource = { state.selectSource(it) }
            )
        }

        if (settingsOpen) {
            SettingsDialog(prefs) { settingsOpen = false }
        }
    }
}

private fun playExternal(context: Context, option: PlaybackOption) {
    val url = if (option.hasSeparateAudio)
        option.masterUrl ?: option.url
    else
        option.url

    val intent = Intent(Intent.ACTION_VIEW).apply {
        data = Uri.parse(url)
        type = option.mimeType
            ?: if (url.contains(".m3u8"))
                "application/vnd.apple.mpegurl"
            else
                "video/*"
    }

    context.startActivity(
        Intent.createChooser(intent, "Выберите внешний плеер")
    )
}
