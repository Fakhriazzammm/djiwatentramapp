$baseUrl = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/"
$files = @(
    "ssd_mobilenetv1_model-weights_manifest.json",
    "ssd_mobilenetv1_model-shard1",
    "face_landmark_68_model-weights_manifest.json",
    "face_landmark_68_model-shard1",
    "face_recognition_model-weights_manifest.json",
    "face_recognition_model-shard1"
)

$targetDir = "apps/web/public/models"
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir
}

foreach ($file in $files) {
    $targetPath = Join-Path $targetDir $file
    Write-Host "Downloading $file..."
    Invoke-WebRequest -Uri ($baseUrl + $file) -OutFile $targetPath
}

Write-Host "All models downloaded successfully."
