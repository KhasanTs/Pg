package ru.ruvideohub.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.ui.components.SelectorBlock

@Composable
fun DetailsScreen(
    movie: Movie,
    tv: Boolean,
    favorite: Boolean,
    loading: Boolean,
    onBack: () -> Unit,
    onFavorite: () -> Unit,
    onPlayExternal: (PlaybackOption) -> Unit
) {
    val quality = movie.options.mapNotNull { it.quality }.distinct()
    val audio = movie.options.mapNotNull { it.audio }.distinct()
    val subs = movie.options.mapNotNull { it.subtitles }.distinct()
    var selectedOption by remember(movie.id) { mutableStateOf(movie.options.firstOrNull()) }
    val horizontal = if (tv) 54.dp else 16.dp
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AsyncImage(
            model = movie.backdrop ?: movie.poster, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(if (tv) 470.dp else 300.dp)
        )
        Box(
            Modifier.fillMaxWidth().height(if (tv) 520.dp else 350.dp)
                .background(Brush.verticalGradient(listOf(Color.Transparent, MaterialTheme.colorScheme.background, MaterialTheme.colorScheme.background)))
        )
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = horizontal),
            contentPadding = PaddingValues(top = 24.dp, bottom = 55.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Назад") } }
            item {
                Row(Modifier.padding(top = if (tv) 145.dp else 65.dp), horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.Bottom) {
                    AsyncImage(
                        model = movie.poster, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.width(if (tv) 245.dp else 145.dp).height(if (tv) 355.dp else 220.dp).clip(RoundedCornerShape(15.dp))
                    )
                    Column(Modifier.weight(1f)) {
                        Text(movie.title, fontSize = if (tv) 44.sp else 29.sp, fontWeight = FontWeight.Black)
                        if (movie.originalTitle.isNotBlank() && movie.originalTitle != movie.title) Text(movie.originalTitle, color = Color.Gray, fontSize = 16.sp)
                        Spacer(Modifier.height(10.dp))
                        Text(detailsMeta(movie), color = Color.LightGray)
                        Spacer(Modifier.height(14.dp))
                        if (movie.genres.isNotEmpty()) Text(movie.genres.joinToString(" • "), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        Spacer(Modifier.height(15.dp))
                        Text(
                            movie.description.ifBlank { "Описание отсутствует у выбранного источника." },
                            color = MaterialTheme.colorScheme.onSurface, lineHeight = 23.sp, maxLines = if (tv) 10 else 9, overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(17.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(enabled = selectedOption != null, onClick = { selectedOption?.let(onPlayExternal) }) {
                                Icon(Icons.Default.PlayArrow, null); Spacer(Modifier.width(7.dp)); Text("Смотреть")
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = onFavorite) {
                            Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null)
                            Spacer(Modifier.width(7.dp)); Text(if (favorite) "В избранном" else "В избранное")
                        }
                    }
                }
            }
            item { Text("Источник: ${movie.source.ifBlank { "RUTUBE" }}", color = Color.Gray) }
            if (movie.views != null || movie.duration != null) item {
                Text(listOfNotNull(movie.views?.let { "$it просмотров" }, movie.duration).joinToString(" • "), color = Color.Gray)
            }
            item {
                SelectorBlock("Качество", if (quality.isNotEmpty()) quality else listOf("Нет данных"), selectedOption) { chosen ->
                    selectedOption = movie.options.firstOrNull { it.quality == chosen } ?: selectedOption
                }
            }
            item {
                SelectorBlock("Озвучка", if (audio.isNotEmpty()) audio else listOf("Нет данных"), selectedOption) { chosen ->
                    selectedOption = movie.options.firstOrNull { it.audio == chosen } ?: selectedOption
                }
            }
            item {
                SelectorBlock("Субтитры", if (subs.isNotEmpty()) subs else listOf("Нет данных"), selectedOption) { chosen ->
                    selectedOption = movie.options.firstOrNull { it.subtitles == chosen } ?: selectedOption
                }
            }
            if (loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        }
    }
}

private fun detailsMeta(movie: Movie): String = listOfNotNull(
    movie.year?.toString(),
    movie.rating?.let { "★ ${"%.1f".format(it)}" },
    movie.author.ifBlank { null }
).joinToString(" • ")
