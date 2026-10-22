<#
.SYNOPSIS
    AETHER PITCH - overnight autonomous improvement watchdog (Windows).

.DESCRIPTION
    Re-launches `opencode run` against overnight_prompt.md until the wall-clock
    window expires. Each launch is a fresh session; the agent rebuilds its
    bearings from AUTONOMOUS_BACKLOG.md / AUTONOMOUS_LOG.md, so state survives
    between iterations.

    The loop is detached from any interactive shell - stdout and stderr go to a
    log file, so it will not hold a terminal open.

.PARAMETER Hours
    Wall-clock window in hours. Default 8.

.PARAMETER CooldownSec
    Seconds to wait between iterations. Default 5.

.PARAMETER Branch
    Branch the agent must be on. Default overnight-auto-improve.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\overnight-watchdog.ps1
#>
[CmdletBinding()]
param(
    [double]$Hours = 8,
    [int]$CooldownSec = 5,
    [string]$Branch = 'overnight-auto-improve',
    [string]$PromptFile = 'overnight_prompt.md',
    [string]$LogDir = 'logs\overnight',
    [string]$StopFile = 'STOP_OVERNIGHT',
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$log = Join-Path $LogDir "watchdog-$stamp.log"
$status = Join-Path $LogDir 'overnight_status.json'
$iterations = Join-Path $LogDir 'overnight_iterations.jsonl'
$lockFile = Join-Path $LogDir 'watchdog.lock'

function Say([string]$m) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

# ---- single-instance guard -------------------------------------------------
if (Test-Path $lockFile) {
    $held = Get-Content -LiteralPath $lockFile -Raw -ErrorAction SilentlyContinue
    if ($held) {
        $pid_ = [int]($held.Trim())
        if (Get-Process -Id $pid_ -ErrorAction SilentlyContinue) {
            Write-Output "watchdog already running (pid $pid_). Exiting."
            exit 0
        }
    }
}
Set-Content -LiteralPath $lockFile -Value $PID -Encoding ASCII

# ---- preflight -------------------------------------------------------------
if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    Say 'FATAL: opencode is not on PATH. Aborting.'
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    exit 1
}
if (-not (Test-Path $PromptFile)) {
    Say "FATAL: $PromptFile not found. Aborting."
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    exit 1
}
if (Test-Path $StopFile) {
    Say "FATAL: stop file $StopFile present at startup. Aborting."
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
    exit 1
}

$branchNow = (git branch --show-current 2>$null)
if ($branchNow.Trim() -ne $Branch) {
    Say "WARN: on branch '$branchNow', expected '$Branch'. Switching."
    git checkout $Branch 2>&1 | Out-Null
}

$opencodeVer = (& opencode --version 2>&1 | Select-Object -First 1)
$endTime = (Get-Date).AddHours($Hours)
Say "watchdog start - opencode $($opencodeVer.Trim()) - window $($Hours)h - ends $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Say "repo $repoRoot | branch $Branch | log $log"

$iteration = 0
$headBefore = (git rev-parse --short HEAD 2>$null)

while ((Get-Date) -lt $endTime) {
    $iteration++

    if (Test-Path $StopFile) {
        Say 'STOP file detected - shutting down cleanly.'
        break
    }

    $remaining = [int]($endTime - (Get-Date)).TotalSeconds
    if ($remaining -le 0) { break }

    Say "--- iteration $iteration starting (${remaining}s remaining) ---"

    $promptText = Get-Content -LiteralPath $PromptFile -Raw -Encoding UTF8
    $headBefore = (git rev-parse --short HEAD 2>$null)

    # The prompt is attached as a file (not a giant argv string) so quoting and
    # newlines survive; the message tells the agent to read it first.
    $message = @'
Read the attached `overnight_prompt.md` FIRST and follow it exactly.
It is your complete brief for this session. Begin at section 0 (ORIENTATION).
Do not ask questions - no one is there to answer them.
Work on the `overnight-auto-improve` branch, run the full verification gate
before every commit, and keep going until the window closes.
'@

    $outFile = Join-Path $LogDir "iter-$stamp-$iteration.log"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        if ($DryRun) {
            $result = "DRY RUN - opencode not launched. Prompt chars: $($promptText.Length)"
            $code = 0
        } else {
            $result = & opencode run --auto --print-logs --log-level INFO `
                --file $PromptFile $message 2>&1
            $code = $LASTEXITCODE
        }
    } catch {
        $result = $_ | Out-String
        $code = 1
    }
    $sw.Stop()

    $result | Out-File -LiteralPath $outFile -Encoding UTF8
    $headAfter = (git rev-parse --short HEAD 2>$null)

    Say "--- iteration $iteration done: exit=$code in $([int]$sw.Elapsed.TotalSeconds)s; HEAD $headBefore -> $headAfter ---"

    $record = [ordered]@{
        iteration   = $iteration
        started_utc = (Get-Date).ToUniversalTime().ToString('o')
        exit_code   = $code
        seconds     = [int]$sw.Elapsed.TotalSeconds
        head_before = $headBefore
        head_after  = $headAfter
        log         = $outFile
    }
    Add-Content -LiteralPath $iterations -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8

    @{ status = 'running'; iteration = $iteration; head = $headAfter
       ends = $endTime.ToString('o'); log = $log } |
        ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8

    if (Test-Path $StopFile) {
        Say 'STOP file detected - shutting down cleanly.'
        break
    }

    if ((Get-Date) -lt $endTime) { Start-Sleep -Seconds $CooldownSec }
}

Say "watchdog finished after $iteration iteration(s). Window closed."
@{ status = 'finished'; iterations = $iteration
   head = (git rev-parse --short HEAD 2>$null)
   ended = (Get-Date).ToString('o'); log = $log } |
    ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8

Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
exit 0
