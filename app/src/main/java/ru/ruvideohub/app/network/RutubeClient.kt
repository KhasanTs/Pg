package ru.ruvideohub.app.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.model.VideoSearchResult
import ru.ruvideohub.app.util.formatDuration
import java.net.URI
import java.net.URLEncoder

private const val HLS_MIME = "application/vnd.apple.mpegurl"

/**
 * Клиент RUTUBE.
 *
 * Логика получения потока переписана по образцу того, как это делают браузерные
 * расширения для поиска видео: вместо "найти любую строку с .m3u8
 * где угодно в JSON" сначала явно читаем официальное поле video_balancer.m3u8,
 * с фолбэком на live_streams.hls, и только если их нет — идём в старый режим
 * поиска по всему дереву JSON. Это надёжнее и не путает служебные плейлисты.
 */
class RutubeClient {
    private val http = OkHttpClient()

    private fun get(url: String, referer: String? = null): String? {
        val builder = Request.Builder()
            .url(url)
            .header("User-Agent", "RuVideoHub/13 Android")
            .header("Accept", "application/json")
        referer?.let { builder.header("Referer", it) }
        return runCatching {
            http.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) response.body?.string() else null
            }
        }.getOrNull()
    }

    suspend fun search(query: String, page: Int = 1): VideoSearchResult = withContext(Dispatchers.IO) {
        val q = URLEncoder.encode(query, "UTF-8")
        val raw = get("https://rutube.ru/api/search/video/?query=$q&page=$page&limit=30")
            ?: return@withContext VideoSearchResult(emptyList(), "RUTUBE: не удалось получить ответ")
        try {
            val root = JSONObject(raw)
            val results = when {
                root.optJSONArray("results") != null -> root.optJSONArray("results")!!
                root.optJSONArray("data") != null -> root.optJSONArray("data")!!
                root.optJSONObject("data")?.optJSONArray("results") != null -> root.optJSONObject("data")!!.optJSONArray("results")!!
                else -> JSONArray()
            }
            val list = buildList {
                for (i in 0 until results.length()) {
                    val item = results.optJSONObject(i) ?: continue
                    val id = item.optString("id").ifBlank { item.optString("video_id") }
                    val title = item.optString("title").ifBlank { item.optString("name") }
                    if (id.isBlank() || title.isBlank()) continue
                    add(
                        Movie(
                            id = "rutube:$id",
                            title = title,
                            poster = firstNonBlank(item, "thumbnail_url", "picture", "thumbnail", "picture_url"),
                            backdrop = firstNonBlank(item, "thumbnail_url", "picture"),
                            description = item.optString("description"),
                            source = "RUTUBE",
                            author = item.optJSONObject("author")?.optString("name").orEmpty().ifBlank { item.optString("author") },
                            views = item.optLong("views", -1).takeIf { it >= 0 },
                            duration = formatDuration(item.optLong("duration", -1).takeIf { it >= 0 })
                        )
                    )
                }
            }
            VideoSearchResult(list)
        } catch (e: Exception) {
            VideoSearchResult(emptyList(), "RUTUBE: ошибка формата ответа")
        }
    }

    suspend fun playback(movie: Movie): List<PlaybackOption> = withContext(Dispatchers.IO) {
        val rawId = movie.id.removePrefix("rutube:")
        val referer = "https://rutube.ru/video/$rawId/"
        val apiUrl = "https://rutube.ru/api/play/options/$rawId/" +
            "?format=json&no_404=true&referer=${URLEncoder.encode(referer, "UTF-8")}&pver=v2"

        val raw = get(apiUrl, referer)
            ?: get("https://rutube.ru/api/play/options/$rawId/?format=json")
            ?: return@withContext emptyList()

        val root = runCatching { JSONObject(raw) }.getOrNull() ?: return@withContext emptyList()

        // 1) Официальное поле: video_balancer.m3u8
        val balancerM3u8 = root.optJSONObject("video_balancer")?.optString("m3u8").orEmpty()

        // 2) Фолбэк: live_streams.hls (может быть строкой или массивом объектов с url)
        val liveHls = if (balancerM3u8.isBlank()) {
            val hls = root.optJSONObject("live_streams")?.opt("hls")
            when (hls) {
                is String -> hls
                is JSONArray -> (0 until hls.length()).asSequence()
                    .mapNotNull { hls.optJSONObject(it)?.optString("url") }
                    .firstOrNull { it.isNotBlank() }.orEmpty()
                else -> ""
            }
        } else ""

        // 3) Последний фолбэк — как раньше, ищем любые .m3u8 строки по всему дереву
        val master = balancerM3u8.ifBlank { liveHls }.ifBlank {
            val urls = linkedMapOf<String, String>()
            runCatching { findUrls(root, urls) }
            urls.values.firstOrNull { it.contains(".m3u8", ignoreCase = true) }.orEmpty()
        }

        if (master.isBlank()) return@withContext emptyList()

        val playlist = get(master, referer) ?: return@withContext listOf(PlaybackOption("RUTUBE", "Авто", master, mimeType = HLS_MIME))
        val options = parseMasterPlaylist(playlist, master)
        if (options.isEmpty()) {
            listOf(PlaybackOption("RUTUBE", "Авто", master, mimeType = HLS_MIME))
        } else {
            options.distinctBy { Triple(it.url, it.quality, it.label) }
        }
    }

    private fun firstNonBlank(item: JSONObject, vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
        item.optString(key).takeIf { it.isNotBlank() }
    }

    private fun findUrls(value: Any?, out: MutableMap<String, String>) {
        when (value) {
            is JSONObject -> {
                value.keys().forEach { key ->
                    val child = value.opt(key)
                    if (child is String && child.contains(".m3u8", true)) out[key] = child
                    findUrls(child, out)
                }
            }
            is JSONArray -> for (i in 0 until value.length()) findUrls(value.opt(i), out)
        }
    }

    /**
     * Разбор master-плейлиста HLS с защитой от "аудио-only" дорожек.
     * RUTUBE (как и OK/Mail.ru) иногда кладёт в master отдельную AUDIO-дорожку
     * через #EXT-X-MEDIA:TYPE=AUDIO — её нельзя показывать как вариант "качества",
     * иначе пользователь выберет звук без изображения.
     */
    private fun parseMasterPlaylist(text: String, masterUrl: String): List<PlaybackOption> {
        val lines = text.lines()
        val hasSeparateAudioTrack = lines.any { it.startsWith("#EXT-X-MEDIA:") && it.contains("TYPE=AUDIO") }
        val out = mutableListOf<PlaybackOption>()
        var pendingQuality: String? = null
        var pendingIsAudioOnly = false
        for (i in lines.indices) {
            val line = lines[i].trim()
            if (line.startsWith("#EXT-X-STREAM-INF:")) {
                val res = Regex("RESOLUTION=(\\d+)x(\\d+)").find(line)
                val codecs = Regex("CODECS=\"([^\"]*)\"").find(line)?.groupValues?.get(1).orEmpty()
                pendingQuality = res?.let { "${it.groupValues[2]}p" }
                pendingIsAudioOnly = res == null && codecs.isNotBlank() &&
                    !Regex("avc|hev|hvc|vp0?9|av01", RegexOption.IGNORE_CASE).containsMatchIn(codecs)
            } else if (pendingQuality != null && line.isNotBlank() && !line.startsWith("#")) {
                if (!pendingIsAudioOnly) {
                    val url = resolveRelative(masterUrl, line)
                    out.add(
                        PlaybackOption(
                            source = "RUTUBE",
                            label = pendingQuality!!,
                            url = url,
                            quality = pendingQuality,
                            mimeType = HLS_MIME,
                            hasSeparateAudio = hasSeparateAudioTrack,
                            masterUrl = if (hasSeparateAudioTrack) masterUrl else null
                        )
                    )
                }
                pendingQuality = null
                pendingIsAudioOnly = false
            }
        }
        return out.sortedByDescending { qualityRank(it.quality) }
    }

    private fun resolveRelative(base: String, child: String): String {
        if (child.startsWith("http://") || child.startsWith("https://")) return child
        return runCatching { URI(base).resolve(child).toString() }.getOrElse { child }
    }

    private fun qualityRank(value: String?): Int = value?.removeSuffix("p")?.toIntOrNull() ?: 0
}
