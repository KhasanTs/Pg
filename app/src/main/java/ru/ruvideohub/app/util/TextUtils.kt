package ru.ruvideohub.app.util

import java.util.Locale
import kotlin.math.max

private val punctuationRegex = "[\\p{Punct}\\p{S}]".toRegex()
private val spacesRegex = "\\s+".toRegex()

/**
 * Нормализация для поиска:
 * - нижний регистр;
 * - ё -> е;
 * - пунктуация/лишние пробелы удаляются;
 * - разные разделители не влияют на результат.
 */
fun normalize(text: String): String = text
    .lowercase(Locale.ROOT)
    .replace('ё', 'е')
    .replace(punctuationRegex, " ")
    .replace(spacesRegex, " ")
    .trim()

private val ruToEn = mapOf(
    'й' to 'q','ц' to 'w','у' to 'e','к' to 'r','е' to 't','н' to 'y','г' to 'u','ш' to 'i',
    'щ' to 'o','з' to 'p','х' to '[','ъ' to ']','ф' to 'a','ы' to 's','в' to 'd','а' to 'f',
    'п' to 'g','р' to 'h','о' to 'j','л' to 'k','д' to 'l','ж' to ';','э' to '\'','я' to 'z',
    'ч' to 'x','с' to 'c','м' to 'v','и' to 'b','т' to 'n','ь' to 'm','б' to ',','ю' to '.',
    'й' to 'q'
)
private val enToRu = ruToEn.entries.associate { (ru, en) -> en to ru }

fun keyboardSwap(text: String): String = buildString(text.length) {
    for (c in text.lowercase(Locale.ROOT)) {
        append(ruToEn[c] ?: enToRu[c] ?: c)
    }
}

/**
 * Очень лёгкий стемминг русских/английских слов. Он нужен не для
 * полноценного морфологического анализа, а чтобы "смерть" и "смерти",
 * "серия" и "серии" считались близкими.
 */
fun searchStem(word: String): String {
    var w = normalize(word).replace(" ", "")
    if (w.length <= 3) return w
    val endings = listOf(
        "иями","ями","ами","ого","ему","ому","ее","ие","ые","ое","ей","ий","ый","ой",
        "ем","им","ым","ом","ах","иях","ях","иях","ами","ями","ию","ью","ия","ья",
        "ов","ев","ей","ы","и","а","я","е","о","у","ю","ь","s","es","ed","ing"
    )
    for (ending in endings.sortedByDescending { it.length }) {
        if (w.endsWith(ending) && w.length - ending.length >= 3) {
            w = w.removeSuffix(ending)
            break
        }
    }
    return w
}

fun levenshtein(a: String, b: String): Int {
    if (a == b) return 0
    if (a.isEmpty()) return b.length
    if (b.isEmpty()) return a.length
    val prev = IntArray(b.length + 1) { it }
    val cur = IntArray(b.length + 1)
    for (i in a.indices) {
        cur[0] = i + 1
        for (j in b.indices) {
            val cost = if (a[i] == b[j]) 0 else 1
            cur[j + 1] = minOf(cur[j] + 1, prev[j + 1] + 1, prev[j] + cost)
        }
        for (j in prev.indices) prev[j] = cur[j]
    }
    return prev[b.length]
}

private fun tokenSimilarity(q: String, t: String): Int {
    if (q == t) return 100
    if (q.length >= 3 && (t.startsWith(q) || q.startsWith(t))) return 88

    val qs = searchStem(q)
    val ts = searchStem(t)
    if (qs.isNotBlank() && qs == ts) return 92
    if (qs.length >= 3 && (ts.startsWith(qs) || qs.startsWith(ts))) return 84

    val maxLen = max(q.length, t.length)
    if (maxLen < 3) return 0
    val d = levenshtein(q, t)
    val allowed = when {
        maxLen <= 4 -> 1
        maxLen <= 7 -> 2
        else -> 3
    }
    return if (d <= allowed) max(0, 78 - d * 18) else 0
}

/**
 * Ранжирование не зависит от порядка слов. Каждому слову запроса
 * подбирается лучший токен заголовка/оригинального названия.
 */
fun relevance(query: String, title: String): Int {
    val q = normalize(query)
    val t = normalize(title)
    if (q.isBlank() || t.isBlank()) return 0
    if (t == q) return 2000
    if (t.startsWith(q)) return 1800
    if (t.contains(q)) return 1650

    val qt = q.split(' ').filter { it.length >= 1 }
    val tt = t.split(' ').filter { it.length >= 1 }
    if (qt.isEmpty() || tt.isEmpty()) return 0

    val matches = qt.map { qw ->
        tt.maxOfOrNull { tw -> tokenSimilarity(qw, tw) } ?: 0
    }

    val matched = matches.count { it >= 50 }
    val strong = matches.count { it >= 80 }
    val total = matches.sum()

    // Штрафуем отсутствие слов, но не требуем их в том же порядке.
    val coverage = matched * 260
    val strongBonus = strong * 90
    val missingPenalty = (qt.size - matched) * 90
    val compactBonus = if (matched == qt.size) 220 else 0

    return max(0, coverage + strongBonus + compactBonus - missingPenalty + total / 4)
}

/**
 * Несколько безопасных вариантов запроса. Не меняем смысл запроса:
 * исходная строка -> исправленная раскладка -> очищенная строка ->
 * стеммированный вариант. Это помогает при "руддщ", лишнем знаке,
 * недописанном слове и раскладке EN/RU.
 */
fun searchVariants(query: String): List<String> {
    val original = query.trim()
    val normalized = normalize(original)
    val swapped = normalize(keyboardSwap(original))
    val stemmed = normalized.split(' ')
        .filter { it.isNotBlank() }
        .joinToString(" ") { searchStem(it) }

    return linkedSetOf<String>().apply {
        if (original.isNotBlank()) add(original)
        if (normalized.isNotBlank()) add(normalized)
        if (swapped.isNotBlank() && swapped != normalized) add(swapped)
        if (stemmed.isNotBlank() && stemmed != normalized) add(stemmed)
        // Для длинного запроса пробуем отдельные значимые слова как fallback.
        normalized.split(' ')
            .filter { it.length >= 3 }
            .take(2)
            .forEach { add(it) }
    }.take(6)
}

fun formatDuration(seconds: Long?): String? {
    if (seconds == null || seconds < 0) return null
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s)
    else "%d:%02d".format(m, s)
}
