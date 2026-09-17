package ru.ruvideohub.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import ru.ruvideohub.app.model.Movie

@Composable
fun MovieCard(movie: Movie, tv: Boolean, onOpen: (Movie) -> Unit) {
    val width = if (tv) 178.dp else 136.dp
    val height = if (tv) 266.dp else 200.dp
    Column(Modifier.width(width).clickable { onOpen(movie) }) {
        Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(13.dp))) {
            AsyncImage(model = movie.poster, contentDescription = movie.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(height))
            if (movie.rating != null) RatingBadge(movie.rating)
        }
        Spacer(Modifier.height(8.dp))
        Text(movie.title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
        val meta = listOfNotNull(movie.year?.toString(), movie.source.ifBlank { null }).joinToString(" • ")
        if (meta.isNotBlank()) Text(meta, color = Color.Gray, fontSize = 12.sp)
    }
}

@Composable
fun RatingBadge(rating: Double) {
    Surface(Modifier.padding(7.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(9.dp)) {
        Text("★ ${"%.1f".format(rating)}", Modifier.padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}
