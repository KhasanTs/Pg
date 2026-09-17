package ru.ruvideohub.app.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ru.ruvideohub.app.model.PlaybackOption

@Composable
fun SelectorBlock(title: String, values: List<String>, selected: PlaybackOption?, onChosen: (String) -> Unit) {
    Column {
        Text(title, fontSize = 21.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            values.forEach { value ->
                val active = when (title) {
                    "Качество" -> selected?.quality == value
                    "Озвучка" -> selected?.audio == value
                    "Субтитры" -> selected?.subtitles == value
                    else -> false
                }
                FilterChip(selected = active, onClick = { if (value != "Нет данных") onChosen(value) }, label = { Text(value) })
            }
        }
    }
}
