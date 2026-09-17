package ru.ruvideohub.app.network

import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import ru.ruvideohub.app.model.Movie
import java.net.URLEncoder

class KinopoiskClient(private val prefs: SharedPreferences) {
    private val http = OkHttpClient()
    private val base = "https://kinopoiskapiunofficial.tech"

    private fun request(path: String): String? {
        val key = prefs.getString("kp_key", "").orEmpty()
        if (key.isBlank()) return null
        val req = Request.Builder().url(base + path).header("X-API-KEY", key).build()
        return runCatching { http.newCall(req).execute().use { if (it.isSuccessful) it.body?.string() else null } }.getOrNull()
    }

    suspend fun details(id: Int): Movie? = withContext(Dispatchers.IO) {
        val raw = request("/api/v2.2/films/$id") ?: return@withContext null
        runCatching {
            val f = JSONObject(raw)
            Movie(
                id = "kp:${id}",
                title = f.optString("nameRu").ifBlank { f.optString("nameOriginal").ifBlank { f.optString("nameEn") } },
                originalTitle = f.optString("nameOriginal"),
                year = f.optInt("year").takeIf { it > 0 },
                poster = f.optString("posterUrl").takeIf { it.isNotBlank() },
                backdrop = f.optString("coverUrl").takeIf { it.isNotBlank() },
                description = f.optString("description"),
                rating = f.optDouble("ratingKinopoisk", Double.NaN).takeUnless { it.isNaN() },
                genres = f.optJSONArray("genres")?.let { a -> buildList { for (i in 0 until a.length()) add(a.optJSONObject(i)?.optString("genre").orEmpty()) } }?.filter { it.isNotBlank() } ?: emptyList(),
                kpId = id
            )
        }.getOrNull()
    }

    suspend fun search(query: String): List<Movie> = withContext(Dispatchers.IO) {
        val encoded = URLEncoder.encode(query, "UTF-8")
        val raw = request("/api/v2.1/films/search-by-keyword?keyword=$encoded&page=1") ?: return@withContext emptyList()
        runCatching {
            val data = JSONObject(raw).optJSONObject("data") ?: return@runCatching emptyList()
            val films = data.optJSONArray("films") ?: return@runCatching emptyList()
            buildList {
                for (i in 0 until films.length()) {
                    val f = films.optJSONObject(i) ?: continue
                    val id = f.optInt("filmId")
                    if (id <= 0) continue
                    add(
                        Movie(
                            id = "kp:$id",
                            title = f.optString("nameRu").ifBlank { f.optString("nameEn") },
                            originalTitle = f.optString("nameEn"),
                            year = f.optString("year").toIntOrNull(),
                            poster = f.optString("posterUrl").ifBlank { f.optString("posterUrlPreview") },
                            rating = f.optString("rating").toDoubleOrNull(),
                            kpId = id,
                            source = "КИНОПОИСК"
                        )
                    )
                }
            }
        }.getOrElse { emptyList() }
    }
}
