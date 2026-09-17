package ru.ruvideohub.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

data class SearchSource(val key: String, val title: String)

@Composable
fun SourceGrid(
    selectedSource: String,
    onSource: (String) -> Unit
) {
    val sources = listOf(
        SearchSource("rutube", "RUTUBE"),
        SearchSource("vk", "VK"),
        SearchSource("mail", "MAIL.RU")
    )

    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(sources, key = { it.key }) { source ->
            val selected = selectedSource == source.key

            Surface(
                modifier = Modifier.clickable { onSource(source.key) },
                shape = RoundedCornerShape(14.dp),
                color = if (selected)
                    MaterialTheme.colorScheme.primary
                else
                    MaterialTheme.colorScheme.surfaceVariant
            ) {
                Column(
                    modifier = Modifier.padding(
                        horizontal = 20.dp,
                        vertical = 14.dp
                    ),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        source.title,
                        color = if (selected)
                            MaterialTheme.colorScheme.onPrimary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        if (selected) "Выбран" else "Искать здесь",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selected)
                            MaterialTheme.colorScheme.onPrimary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
