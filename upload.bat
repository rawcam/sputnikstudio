$token = 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
$owner = rawcam
$repo = sputnik-studio
$filePath = "index.html"
$apiUrl = "https://api.github.com/repos/$owner/$repo/contents/$filePath"

# Получаем SHA текущего файла
$response = Invoke-RestMethod -Uri $apiUrl -Headers @{ Authorization = "token $token" }
$sha = $response.sha

# Кодируем содержимое файла в base64
$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes($filePath))

# Формируем тело запроса
$body = @{
    message = "Обновление через API"
    content = $content
    sha     = $sha
} | ConvertTo-Json

# Отправляем обновление
Invoke-RestMethod -Method Put -Uri $apiUrl -Headers @{
    Authorization = "token $token"
    "Content-Type" = "application/json"
} -Body $body

Write-Host "Файл успешно загружен!"
