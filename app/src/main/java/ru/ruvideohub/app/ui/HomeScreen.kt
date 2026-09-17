package ru.ruvideohub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.state.MainState
import ru.ruvideohub.app.ui.components.Catalogs
import ru.ruvideohub.app.ui.components.Hero
import ru.ruvideohub.app.ui.components.MovieCard
import ru.ruvideohub.app.ui.components.SearchBox
import ru.ruvideohub.app.ui.components.SourceGrid

@Composable
fun HomeScreen(
    state: MainState,
    onOpen: (Movie) -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
    onSource: (String) -> Unit
) {
    val pad = 44.dp

    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = pad, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("RU VIDEO HUB", fontSize = 27.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.width(22.dp))

            SearchBox(state.query, { state.query = it }, onSearch, true)

            Spacer(Modifier.weight(1f))
            IconButton(onClick = onSettings) {
                Icon(Icons.Default.Settings, "Настройки")
            }
        }

        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = pad),
            contentPadding = PaddingValues(bottom = 40.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp)
        ) {
            item { Hero(true) }
            item { Catalogs(true) }

            item {
                Text(
                    "Источник поиска",
                    fontSize = 23.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            item {
                SourceGrid(
                    selectedSource = state.selectedSource,
                    onSource = onSource
                )
            }

            if (state.loading) {
                item {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                }
            }

            state.error?.let { msg ->
                item {
                    Text(
                        msg,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            if (state.results.isNotEmpty()) {
                item {
                    Text(
                        "Результаты: ${state.selectedSource.uppercase()}",
                        fontSize = 23.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        items(state.results, key = { it.id }) {
                            MovieCard(it, true, onOpen)
                        }
                    }
                }
            }
        }
    }
}
