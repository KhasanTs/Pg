package ru.ruvideohub.app.util

import ru.ruvideohub.app.model.PlaybackOption
import java.net.URI

/**
 * Разбор master-плейлиста HLS (#EXT-X-STREAM-INF).
 *
 * Логика подсмотрена и адаптирована из пользовательского браузерного расширения
 * ("Video to Player Kiwi — Finish" v13, background.js) — там было замечено, что
 * RUTUBE (и другие площадки, отдающие видео и аудио отдельными HLS-дорожками)
 * может вернуть в master-плейлисте отдельную "дорожку" без RESOLUTION, которая
 * на деле является чистым аудио (CODECS=mp4a.40.2 и т.п.). Старый парсер такие
 * дорожки ошибочно показывал в списке "качеств". Здесь мы явно фильтруем
 * audio-only варианты по CODECS/URL и оставляем только настоящие видео-варианты.
 */
object HlsMasterParser {

    private val AUDIO_CODECS = Regex("(?:^|[,\\s])(mp4a|ac-3|ec-3|opus|vorbis|aac)(?:[.,]|$)", RegexOption.IGNORE_CASE)
    private val VIDEO_CODECS = Regex("avc|h26[45]|hev|vp0?9|av01|vp8|theora", RegexOption.IGNORE_CASE)
    private val AUDIO_URL_HINT = Regex("(?:^|[._/?=&-])audio(?:[._/?=&-]|$)", RegexOption.IGNORE_CASE)
    private const val HLS_MIME = "application/vnd.apple.mpegurl"

    data class Variant(val url: String, val height: Int, val bandwidth: Int, val codecs: String)

    fun parse(playlistText: String, masterUrl: String): List<Variant> {
        val lines = playlistText.lines()
        val out = mutableListOf<Variant>()
        var pendingAttrs: Map<String, String>? = null
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
                pendingAttrs = parseAttrs(trimmed.removePrefix("#EXT-X-STREAM-INF:"))
            } else if (pendingAttrs != null && trimmed.isNotBlank() && !trimmed.startsWith("#")) {
                val attrs = pendingAttrs
                pendingAttrs = null
                val url = resolveRelative(masterUrl, trimmed)
                val height = attrs?.get("RESOLUTION")?.let { res -> Regex("\\d+x(\\d+)").find(res)?.groupValues?.get(1)?.toIntOrNull() } ?: 0
                val bandwidth = attrs?.get("BANDWIDTH")?.toIntOrNull() ?: 0
                val codecs = attrs?.get("CODECS").orEmpty()

                val audioOnly = height == 0 && (AUDIO_CODECS.containsMatchIn(codecs) || AUDIO_URL_HINT.containsMatchIn(url))
                val looksLikeVideo = height > 0 || VIDEO_CODECS.containsMatchIn(codecs)
                // Пропускаем чисто аудио-дорожку, если она не выглядит как видео —
                // именно это раньше приводило к тому, что в списке качеств
                // оказывался пункт со звуком без картинки.
                if (audioOnly && !looksLikeVideo) continue

                out.add(Variant(url, height, bandwidth, codecs))
            }
        }
        return out.distinctBy { it.url }.sortedByDescending { it.height * 10_000_000 + it.bandwidth }
    }

    fun toPlaybackOptions(variants: List<Variant>, source: String): List<PlaybackOption> =
        variants.map { v ->
            val label = if (v.height > 0) "${v.height}p" else if (v.bandwidth > 0) "${v.bandwidth / 1000} kbps" else "Авто"
            PlaybackOption(source = source, label = label, url = v.url, quality = label, mimeType = HLS_MIME)
        }

    private fun parseAttrs(raw: String): Map<String, String> {
        val out = mutableMapOf<String, String>()
        val regex = Regex("([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)")
        regex.findAll(raw).forEach { m ->
            val key = m.groupValues[1]
            val value = m.groupValues[2].trim('"')
            out[key] = value
        }
        return out
    }

    private fun resolveRelative(base: String, child: String): String {
        if (child.startsWith("http://") || child.startsWith("https://")) return child
        return runCatching { URI(base).resolve(child).toString() }.getOrElse { child }
    }
}
