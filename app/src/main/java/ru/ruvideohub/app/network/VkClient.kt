package ru.ruvideohub.app.network

import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.model.VideoSearchResult
import ru.ruvideohub.app.util.formatDuration
import java.net.URLEncoder

/**
 * Клиент VK Video через официальный метод VK API `video.search`.
 *
 * В отличие от VK-записи в [GenericJsonSourceClient] (которая просто дёргает
 * произвольный настраиваемый JSON-эндпоинт), этот клиент говорит напрямую
 * с api.vk.com по документированному методу и сразу разбирает объект `files`
 * с готовым набором качеств (mp4_240 … mp4_1080, hls), а не ждёт единственную
 * ссылку "playUrl" от стороннего сервера.
 *
 * Требует access_token (поле "VK API token" в настройках источника VK) —
 * персональный или сервисный токен с правом video, который пользователь
 * получает сам через VK ID / VK API (Implicit Flow) и вводит в приложении.
 * Без токена источник просто не участвует в поиске.
 */
class VkClient(private val prefs: SharedPreferences) {
    private val http = OkHttpClient()
    private val apiVersion = "5.199"

    suspend fun search(query: String): VideoSearchResult = withContext(Dispatchers.IO) {
        val token = prefs.getString("vk_token", "").orEmpty().trim()
        if (token.isBlank()) return@withContext VideoSearchResult(emptyList(), "VK: не указан access_token")

        val q = URLEncoder.encode(query, "UTF-8")
        val url = "https://api.vk.com/method/video.search" +
            "?q=$q&count=20&hd=2&access_token=${URLEncoder.encode(token, "UTF-8")}&v=$apiVersion"

        val request = Request.Builder().url(url).header("User-Agent", "RuVideoHub/13 Android").build()
        val raw = runCatching {
            http.newCall(request).execute().use { if (it.isSuccessful) it.body?.string() else null }
        }.getOrNull() ?: return@withContext VideoSearchResult(emptyList(), "VK: нет ответа от api.vk.com")

        runCatching {
            val root = JSONObject(raw)
            root.optJSONObject("error")?.let { err ->
                val msg = err.optString("error_msg", "неизвестная ошибка")
                return@withContext VideoSearchResult(emptyList(), "VK: $msg")
            }
            val items = root.optJSONObject("response")?.optJSONArray("items") ?: return@runCatching VideoSearchResult(emptyList())
            val list = buildList {
                for (i in 0 until items.length()) {
                    val v = items.optJSONObject(i) ?: continue
                    val ownerId = v.optLong("owner_id")
                    val videoId = v.optLong("id")
                    if (videoId == 0L) continue
                    val id = "vk:${ownerId}_$videoId"
                    val title = v.optString("title").ifBlank { continue }
                    val image = v.optJSONArray("image")
                    val poster = image?.let { arr -> (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.optString("url") }.lastOrNull() }
                    val files = v.optJSONObject("files")
                    add(
                        Movie(
                            id = id,
                            title = title,
                            description = v.optString("description"),
                            poster = poster,
                            backdrop = poster,
                            source = "VK",
                            author = v.optString("owner_id"),
                            views = v.optLong("views", -1).takeIf { it >= 0 },
                            duration = formatDuration(v.optLong("duration", -1).takeIf { it >= 0 }),
                            options = files?.let { qualityOptions(it) } ?: emptyList()
                        )
                    )
                }
            }
            VideoSearchResult(list)
        }.getOrElse { VideoSearchResult(emptyList(), "VK: неверный формат JSON") }
    }

    private fun qualityOptions(files: JSONObject): List<PlaybackOption> {
        val mp4Keys = listOf("mp4_2160", "mp4_1440", "mp4_1080", "mp4_720", "mp4_480", "mp4_360", "mp4_240")
        val options = mutableListOf<PlaybackOption>()
        for (key in mp4Keys) {
            val url = files.optString(key)
            if (url.isNotBlank()) {
                val quality = key.removePrefix("mp4_") + "p"
                options.add(PlaybackOption(source = "VK", label = quality, url = url, quality = quality, mimeType = "video/mp4"))
            }
        }
        val hls = files.optString("hls")
        if (hls.isNotBlank()) {
            options.add(PlaybackOption(source = "VK", label = "Авто (HLS)", url = hls, quality = "Авто", mimeType = "application/vnd.apple.mpegurl"))
        }
        return options
    }
}
