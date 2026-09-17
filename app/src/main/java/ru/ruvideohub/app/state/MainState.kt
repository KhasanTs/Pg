package ru.ruvideohub.app.state

import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.model.VideoSearchResult
import ru.ruvideohub.app.network.MailClient
import ru.ruvideohub.app.network.RutubeClient
import ru.ruvideohub.app.network.VkClient
import ru.ruvideohub.app.util.relevance
import ru.ruvideohub.app.util.searchVariants

/**
 * Состояние главного экрана.
 *
 * Поиск идёт только в выбранном пользователем источнике. Для него делается
 * несколько вариантов запроса, после чего результаты объединяются и
 * ранжируются локально. Это позволяет переживать:
 * - другой порядок слов;
 * - "ё/е" и знаки препинания;
 * - небольшие опечатки;
 * - недописанные слова;
 * - случайную раскладку RU/EN.
 */
class MainState(private val prefs: SharedPreferences) {

    private val rutube = RutubeClient()
    private val vk = VkClient(prefs)
    private val mail = MailClient()

    var query by mutableStateOf("")
    var selectedSource by mutableStateOf(
        prefs.getString("selected_source", "rutube").orEmpty()
            .takeIf { it in setOf("rutube", "vk", "mail") } ?: "rutube"
    )

    var results by mutableStateOf<List<Movie>>(emptyList())
    var selected by mutableStateOf<Movie?>(null)
    var options by mutableStateOf<List<PlaybackOption>>(emptyList())
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)

    var favorites by mutableStateOf(loadIds("favorites"))
    var history by mutableStateOf(loadIds("history"))

    private fun loadIds(key: String): Set<String> =
        prefs.getStringSet(key, emptySet()).orEmpty()

    private fun saveIds(key: String, value: Set<String>) =
        prefs.edit().putStringSet(key, value).apply()

    fun selectSource(key: String) {
        if (key !in setOf("rutube", "vk", "mail")) return
        selectedSource = key
        prefs.edit().putString("selected_source", key).apply()
        results = emptyList()
        error = null
    }

    suspend fun search() {
        val q = query.trim()
        if (q.isBlank()) {
            results = emptyList()
            error = "Введите запрос"
            return
        }

        loading = true
        error = null
        results = emptyList()

        try {
            val result = when (selectedSource) {
                "rutube" -> smartSearch(q) { rutube.search(it) }
                "vk" -> smartSearch(q) { vk.search(it) }
                "mail" -> smartSearch(q) { mail.search(it) }
                else -> VideoSearchResult(emptyList(), "Источник не выбран")
            }

            results = result.movies
            if (results.isEmpty()) {
                error = result.error ?: "Ничего не найдено"
            }
        } catch (_: Exception) {
            error = when (selectedSource) {
                "rutube" -> "RUTUBE: ошибка соединения"
                "vk" -> "VK: проверьте access_token и доступ к Video API"
                "mail" -> "MAIL.RU: ошибка поиска"
                else -> "Ошибка поиска"
            }
            results = emptyList()
        } finally {
            loading = false
        }
    }

    /**
     * Выполняет до 6 вариантов запроса последовательно, чтобы не создавать
     * лишнюю сетевую нагрузку. Если первый запрос уже дал хорошие результаты,
     * дополнительные варианты всё равно ограничены и затем отфильтровываются
     * локально.
     */
    private suspend fun smartSearch(
        original: String,
        searcher: suspend (String) -> VideoSearchResult
    ): VideoSearchResult {
        val variants = searchVariants(original)
        val merged = LinkedHashMap<String, Movie>()
        var lastError: String? = null

        for ((index, variant) in variants.withIndex()) {
            val response = searcher(variant)
            if (response.error != null) lastError = response.error

            response.movies.forEach { movie ->
                val old = merged[movie.id]
                // Сохраняем наиболее заполненную карточку.
                merged[movie.id] = if (old == null) movie else mergeMovie(old, movie)
            }

            // Для обычного запроса достаточно первых двух вариантов, если уже
            // найдено несколько точных кандидатов.
            if (index >= 1 && merged.size >= 8) break
        }

        val ranked = merged.values
            .map { movie ->
                val titleText = listOf(movie.title, movie.originalTitle, movie.description)
                    .filter { it.isNotBlank() }
                    .joinToString(" ")
                movie to relevance(original, titleText)
            }
            .filter { it.second >= minimumScore(original) }
            .sortedWith(
                compareByDescending<Pair<Movie, Int>> { it.second }
                    .thenByDescending { it.first.views ?: -1L }
            )
            .map { it.first }
            .distinctBy { it.id }
            .take(50)

        return VideoSearchResult(
            movies = ranked,
            error = if (ranked.isEmpty()) lastError else null
        )
    }

    private fun minimumScore(query: String): Int =
        if (searchVariants(query).size <= 2) 70 else 55

    private fun mergeMovie(a: Movie, b: Movie): Movie = a.copy(
        originalTitle = a.originalTitle.ifBlank { b.originalTitle },
        year = a.year ?: b.year,
        poster = a.poster ?: b.poster,
        backdrop = a.backdrop ?: b.backdrop,
        description = if (a.description.length >= b.description.length) a.description else b.description,
        rating = a.rating ?: b.rating,
        genres = if (a.genres.isNotEmpty()) a.genres else b.genres,
        author = a.author.ifBlank { b.author },
        views = a.views ?: b.views,
        duration = a.duration ?: b.duration,
        options = if (a.options.isNotEmpty()) a.options else b.options
    )

    suspend fun open(movie: Movie) {
        loading = true
        error = null
        try {
            val playback = when {
                movie.id.startsWith("rutube:") -> rutube.playback(movie)
                movie.id.startsWith("mail:") -> mail.playback(movie)
                else -> movie.options
            }
            selected = movie.copy(options = playback)
            options = playback
            history = history.toMutableSet().apply { add(movie.id) }
            saveIds("history", history)
        } catch (_: Exception) {
            selected = movie
            options = movie.options
            error = "Не удалось получить варианты воспроизведения"
        } finally {
            loading = false
        }
    }

    fun toggleFavorite() {
        val m = selected ?: return
        favorites = favorites.toMutableSet().apply {
            if (!add(m.id)) remove(m.id)
        }
        saveIds("favorites", favorites)
    }
}
