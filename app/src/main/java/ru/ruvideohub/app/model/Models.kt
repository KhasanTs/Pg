package ru.ruvideohub.app.model

data class Movie(
    val id: String,
    val title: String,
    val originalTitle: String = "",
    val year: Int? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val description: String = "",
    val rating: Double? = null,
    val genres: List<String> = emptyList(),
    val kpId: Int? = null,
    val source: String = "",
    val author: String = "",
    val views: Long? = null,
    val duration: String? = null,
    val options: List<PlaybackOption> = emptyList()
)

data class PlaybackOption(
    val source: String,
    val label: String,
    val url: String,
    val quality: String? = null,
    val audio: String? = null,
    val subtitles: String? = null,
    val mimeType: String? = null,
    val hasSeparateAudio: Boolean = false,
    val masterUrl: String? = null
)

data class VideoSearchResult(
    val movies: List<Movie>,
    val error: String? = null
)

data class SourceSpec(
    val key: String,
    val title: String
)

val ALL_SOURCES = listOf(
    SourceSpec("rutube", "RUTUBE"),
    SourceSpec("vk", "VK"),
    SourceSpec("mail", "MAIL.RU")
)
