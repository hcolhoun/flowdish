$ErrorActionPreference = "Stop"

$ffmpeg = "C:\Users\Shann\AppData\Local\Temp\flowdish-video-tools\node_modules\ffmpeg-static\ffmpeg.exe"
$sourceDir = "C:\Users\Shann\OneDrive\Desktop\Oran_delivery_dockets\vidoes"
$projectDir = "C:\Users\Shann\kitchen-cloud"
$outputDir = Join-Path $projectDir "artifacts\flowdish-promo"
$segmentsDir = Join-Path $outputDir "segments"
$narrationDir = Join-Path $outputDir "narration-openai-v4"
$logo = Join-Path $projectDir "public\flowdish-banner-logo.png"

New-Item -ItemType Directory -Force -Path $outputDir, $segmentsDir, $narrationDir | Out-Null

function Invoke-FFmpeg {
    param([string[]]$Arguments)

    & $ffmpeg @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "FFmpeg failed with exit code $LASTEXITCODE"
    }
}

function Get-Narration {
    param([string]$Name)

    $path = Join-Path $narrationDir "$Name.mp3"
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Missing OpenAI narration file: $path"
    }
    return $path
}

function New-CardSegment {
    param(
        [string]$Name,
        [double]$Duration,
        [string]$Narration
    )

    $target = Join-Path $segmentsDir "$Name.mp4"
    if (Test-Path -LiteralPath $target) {
        return
    }

    $filter = "[1:v]scale=680:-2,format=rgba,colorkey=0xFFFFFF:0.08:0.05[logo];[0:v][logo]overlay=(W-w)/2:280,format=yuv420p[v];[2:a]adelay=100|100,apad,atrim=0:$Duration,asetpts=PTS-STARTPTS[a]"
    Invoke-FFmpeg @(
        "-y",
        "-f", "lavfi", "-i", "color=c=0xF4F7F8:s=1080x1920:r=30:d=$Duration",
        "-loop", "1", "-i", $logo,
        "-i", $Narration,
        "-filter_complex", $filter,
        "-map", "[v]", "-map", "[a]",
        "-t", "$Duration", "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", $target
    )
}

function New-AppSegment {
    param(
        [string]$Name,
        [string]$Source,
        [double]$Duration,
        [double]$Start,
        [double]$SourceDuration,
        [double]$Speed,
        [ValidateSet("desktop", "mobile", "login")]
        [string]$Layout,
        [string]$Narration,
        [switch]$UseSourceAudio
    )

    $target = Join-Path $segmentsDir "$Name.mp4"
    if (Test-Path -LiteralPath $target) {
        return
    }

    $setPts = "setpts=(PTS-STARTPTS)/$Speed"

    if ($Layout -eq "mobile") {
        $videoBase = "[0:v]$setPts,fps=30,scale=740:-2,pad=1080:1920:(ow-iw)/2:260:0xF4F7F8,drawbox=x=169:y=259:w=742:h=1606:color=0xD6E1E5:t=2,format=yuv420p[base]"
    }
    elseif ($Layout -eq "login") {
        $videoBase = "[0:v]$setPts,fps=30,scale=760:-2,pad=1080:1920:(ow-iw)/2:355:0xF4F7F8,drawbox=x=159:y=354:w=762:h=1330:color=0xD6E1E5:t=2,format=yuv420p[base]"
    }
    else {
        $videoBase = "[0:v]$setPts,fps=30,crop=iw*0.92:ih:iw*0.04:0,scale=1040:-2,setsar=1,pad=1080:1920:(ow-iw)/2:500:0xF4F7F8,format=yuv420p[base]"
    }

    if ($UseSourceAudio) {
        $video = "$videoBase;[1:v]scale=350:-2,format=rgba,colorkey=0xFFFFFF:0.08:0.05[logo];[base][logo]overlay=(W-w)/2:115:eof_action=repeat,format=yuv420p[v]"
        $filter = "$video;[0:a]atempo=$Speed,volume=1.15,apad,atrim=0:$Duration,asetpts=PTS-STARTPTS[a]"
        Invoke-FFmpeg @(
            "-y", "-ss", "$Start", "-t", "$SourceDuration", "-i", $Source,
            "-loop", "1", "-i", $logo,
            "-filter_complex", $filter,
            "-map", "[v]", "-map", "[a]",
            "-t", "$Duration", "-r", "30",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", $target
        )
    }
    else {
        $video = "$videoBase;[2:v]scale=350:-2,format=rgba,colorkey=0xFFFFFF:0.08:0.05[logo];[base][logo]overlay=(W-w)/2:115:eof_action=repeat,format=yuv420p[v]"
        $filter = "$video;[1:a]adelay=100|100,apad,atrim=0:$Duration,asetpts=PTS-STARTPTS[a]"
        Invoke-FFmpeg @(
            "-y", "-ss", "$Start", "-t", "$SourceDuration", "-i", $Source,
            "-i", $Narration,
            "-loop", "1", "-i", $logo,
            "-filter_complex", $filter,
            "-map", "[v]", "-map", "[a]",
            "-t", "$Duration", "-r", "30",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", $target
        )
    }
}

function New-VoiceDemoSegment {
    param(
        [string]$Name,
        [string]$Source,
        [double]$SourceDuration,
        [double]$IntroDuration,
        [double]$FollowUpDelay,
        [string]$IntroNarration,
        [string]$FollowUpNarration
    )

    $target = Join-Path $segmentsDir "$Name.mp4"
    if (Test-Path -LiteralPath $target) {
        return
    }

    $duration = $SourceDuration + $IntroDuration
    $introDelay = 150
    $humanDelay = [int]($IntroDuration * 1000)
    $followDelay = [int]($FollowUpDelay * 1000)
    $humanAudioDuration = $FollowUpDelay - $IntroDuration
    $humanFadeStart = [Math]::Max(0, $humanAudioDuration - 0.2)
    $filter = "[0:v]trim=0:$SourceDuration,setpts=PTS-STARTPTS,fps=30,tpad=start_mode=clone:start_duration=$IntroDuration,scale=740:-2,pad=1080:1920:(ow-iw)/2:260:0xF4F7F8,drawbox=x=169:y=259:w=742:h=1606:color=0xD6E1E5:t=2,format=yuv420p[base];[3:v]scale=350:-2,format=rgba,colorkey=0xFFFFFF:0.08:0.05[logo];[base][logo]overlay=(W-w)/2:115:eof_action=repeat,format=yuv420p[v];[0:a]atrim=0:$humanAudioDuration,asetpts=PTS-STARTPTS,afade=t=out:st=$humanFadeStart`:d=0.2,adelay=$humanDelay|$humanDelay,volume=1.15,apad,atrim=0:$duration[human];[1:a]adelay=$introDelay|$introDelay,apad,atrim=0:$duration[intro];[2:a]adelay=$followDelay|$followDelay,apad,atrim=0:$duration[follow];[intro][human][follow]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.95,atrim=0:$duration[a]"

    Invoke-FFmpeg @(
        "-y", "-t", "$SourceDuration", "-i", $Source,
        "-i", $IntroNarration,
        "-i", $FollowUpNarration,
        "-loop", "1", "-i", $logo,
        "-filter_complex", $filter,
        "-map", "[v]", "-map", "[a]",
        "-t", "$duration", "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", $target
    )
}

$voice = @{}
$voice.intro = Get-Narration "intro"
$voice.login = Get-Narration "login"
$voice.prepIntro = Get-Narration "prep_intro"
$voice.prepOutro = Get-Narration "prep_outro"
$voice.wasteIntro = Get-Narration "waste_intro"
$voice.wasteOutro = Get-Narration "waste_outro"
$voice.delivery = Get-Narration "delivery"
$voice.prices = Get-Narration "prices"
$voice.dashboard = Get-Narration "dashboard"
$voice.cold = Get-Narration "cold"
$voice.forecast = Get-Narration "forecast"
$voice.bom = Get-Narration "bom"
$voice.sop = Get-Narration "sop"
$voice.points = Get-Narration "points"
$voice.outro = Get-Narration "outro"

New-CardSegment "01-intro" 5.2 $voice.intro
New-AppSegment "02-prices" (Join-Path $sourceDir "Price file upload.mp4") 9.2 35 65 7.0652 "desktop" $voice.prices
New-AppSegment "03-bom" (Join-Path $sourceDir "bill of materials expanding cascade from L0.mp4") 10.2 0 21.2 2.0784 "desktop" $voice.bom
New-AppSegment "04-sop" (Join-Path $sourceDir "SOP read aloud and PDF gen.mp4") 9.7 0 26.6453 2.747 "desktop" $voice.sop
New-AppSegment "05-forecast" (Join-Path $sourceDir "prep planning and forecast generation.mp4") 10.5 0 55 5.2381 "desktop" $voice.forecast
New-AppSegment "06-delivery" (Join-Path $sourceDir "Delivery upload.mp4") 9.2 8 34 3.6957 "desktop" $voice.delivery
New-AppSegment "07-dashboard" (Join-Path $sourceDir "dashboard.mp4") 11.3 0 8.8333 0.7817 "desktop" $voice.dashboard
New-AppSegment "08-login" (Join-Path $sourceDir "staff pin login.mp4") 4.0 0 8.4052 2.1013 "login" $voice.login
New-VoiceDemoSegment "09-prep" (Join-Path $sourceDir "prep entry on mobile with audio.mp4") 11.5 5.6 10.8 $voice.prepIntro $voice.prepOutro
New-VoiceDemoSegment "10-waste" (Join-Path $sourceDir "waste entry on mobile with audio.mp4") 9.4 4.0 8.0 $voice.wasteIntro $voice.wasteOutro
New-AppSegment "11-points" (Join-Path $sourceDir "quick recording of the staff pin user with mouse circling around the point column.mp4") 4.8 0 3.5 0.7292 "desktop" $voice.points
New-AppSegment "12-cold" (Join-Path $sourceDir "cold storage graph.mp4") 7.9 0 3.7 0.4684 "desktop" $voice.cold
New-CardSegment "13-outro" 7.4 $voice.outro

$segmentFiles = Get-ChildItem -LiteralPath $segmentsDir -Filter "*.mp4" | Sort-Object Name
$concatPath = Join-Path $outputDir "concat.txt"
$concatLines = $segmentFiles | ForEach-Object { "file '$($_.FullName.Replace("'", "''"))'" }
Set-Content -LiteralPath $concatPath -Value $concatLines -Encoding Ascii

$assembled = Join-Path $outputDir "flowdish-promo-assembled.mp4"
Invoke-FFmpeg @("-y", "-f", "concat", "-safe", "0", "-i", $concatPath, "-c", "copy", $assembled)

$subtitles = Join-Path $projectDir "scripts\flowdish-promo.ass"
$final = Join-Path $outputDir "flowdish-whatsapp-promo.mp4"
Push-Location $projectDir
try {
    Invoke-FFmpeg @(
        "-y", "-i", $assembled,
        "-vf", "ass=scripts/flowdish-promo.ass",
        "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", $final
    )
}
finally {
    Pop-Location
}

Write-Output $final
