package ru.ruvideohub.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Hero(tv: Boolean) {
    Box(Modifier.fillMaxWidth().height(if (tv) 310.dp else 215.dp).clip(RoundedCornerShape(24.dp))) {
        Box(
            Modifier.fillMaxSize().background(
                Brush.linearGradient(listOf(Color(0xFFE8E9EC), Color(0xFFF8F8F9)))
            )
        )
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCCFFFFFF)))))
        Column(Modifier.align(Alignment.BottomStart).padding(28.dp)) {
            Text("Всё видео — в одном месте", fontSize = if (tv) 34.sp else 25.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.height(6.dp))
            Text("Единый поиск • карточки как в онлайн-кинотеатре • встроенный плеер", color = Color(0xFF555B66))
        }
    }
}
