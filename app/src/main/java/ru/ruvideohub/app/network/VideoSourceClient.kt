package ru.ruvideohub.app.network

import ru.ruvideohub.app.model.Movie
import ru.ruvideohub.app.model.PlaybackOption
import ru.ruvideohub.app.model.VideoSearchResult

interface VideoSourceClient {
    suspend fun search(query: String): VideoSearchResult
    suspend fun playback(movie: Movie): List<PlaybackOption>
}
