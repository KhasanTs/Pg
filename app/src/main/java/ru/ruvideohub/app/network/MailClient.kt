package ru.ruvideohub.app.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.model.VideoSearchResult
import java.net.URLEncoder

class MailClient : VideoSourceClient {

    private val http = OkHttpClient()

    private fun get(url: String, accept: String = "text/html"): String? {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "Mozilla/5.0 (Android) RuVideoHub")
            .header("Accept", accept)
            .build()

        return runCatching {
            http.newCall(request).execute().use {
                if (it.isSuccessful) it.body?.string() else null
            }
        }.getOrNull()
    }

    override suspend fun search(query: String): VideoSearchResult =
        withContext(Dispatchers.IO) {
            val q = URLEncoder.encode(query, "UTF-8")
            val html = get("https://my.mail.ru/video/search?q=$q")
                ?: return@withContext VideoSearchResult(emptyList(), "MAIL.RU: поиск недоступен")

            val found = LinkedHashMap<String, String>()

            // Предпочитаем текст ссылки/карточки рядом с embed-id, но
            // оставляем fallback на сам ID, если верстка Mail.ru изменилась.
            val anchorRegex = Regex(
                """<a[^>]+href=["'](?:https?:)?//my\.mail\.ru/video/embed/(\d+)["'][^>]*>(.*?)</a>""",
                setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)
            )
            anchorRegex.findAll(html).take(50).forEach { m ->
                val id = m.groupValues[1]
                val title = m.groupValues[2]
                    .replace(Regex("<[^>]+>"), " ")
                    .replace("&quot;", """)
                    .replace("&amp;", "&")
                    .replace("&nbsp;", " ")
                    .replace(Regex("\s+"), " ")
                    .trim()
                found.putIfAbsent(id, title)
            }

            listOf(
                Regex("""https?://my\.mail\.ru/video/embed/(\d+)"""),
                Regex("""https?://my\.mail\.ru/\+/video/meta/(\d+)""")
            ).forEach { regex ->
                regex.findAll(html).forEach { m -> found.putIfAbsent(m.groupValues[1], "") }
            }

            val movies = found.entries.take(30).map { (id, title) ->
                Movie(
                    id = "mail:$id",
                    title = title.ifBlank { "Видео Mail.ru $id" },
                    source = "MAIL.RU",
                    options = listOf(
                        PlaybackOption(
                            source = "MAIL.RU",
                            label = "Открыть",
                            url = "https://my.mail.ru/video/embed/$id",
                            mimeType = "text/html"
                        )
                    )
                )
            }

            if (movies.isEmpty())
                VideoSearchResult(emptyList(), "MAIL.RU: результаты не распознаны")
            else
                VideoSearchResult(movies)
        }

    override suspend fun playback(movie: Movie): List<PlaybackOption> =
        withContext(Dispatchers.IO) {
            val id = movie.id.removePrefix("mail:")
            val raw = get(
                "https://my.mail.ru/+/video/meta/$id",
                "application/json"
            ) ?: return@withContext movie.options

            val root = runCatching { JSONObject(raw) }.getOrNull()
                ?: return@withContext movie.options

            val result = mutableListOf<PlaybackOption>()
            val videos = root.optJSONArray("videos")

            if (videos != null) {
                for (i in 0 until videos.length()) {
                    val item = videos.optJSONObject(i) ?: continue
                    val url = item.optString("url")
                    if (url.isBlank()) continue

                    val quality = item.optString("key").ifBlank { "Авто" }
                    result += PlaybackOption(
                        source = "MAIL.RU",
                        label = quality,
                        url = url,
                        quality = quality,
                        mimeType = "video/mp4"
                    )
                }
            }

            result.ifEmpty { movie.options }
        }
}
