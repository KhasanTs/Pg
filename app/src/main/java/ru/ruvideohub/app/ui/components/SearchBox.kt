package ru.ruvideohub.app.ui.components

import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

@Composable
fun SearchBox(value: String, onValue: (String) -> Unit, onSearch: () -> Unit, tv: Boolean) {
    OutlinedTextField(
        value = value, onValueChange = onValue, singleLine = true,
        label = { Text("Что будем смотреть?") },
        leadingIcon = { Icon(Icons.Default.Search, null) },
        modifier = Modifier.widthIn(min = if (tv) 430.dp else 220.dp, max = 650.dp),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { onSearch() })
    )
}
