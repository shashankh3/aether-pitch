<#
.SYNOPSIS
    AETHER PITCH - overnight autonomous improvement watchdog (Windows).

.DESCRIPTION
    Re-launches `opencode run` against overnight_prompt.md until the wall-clock
    window expires. Each launch is a fresh session; the agent rebuilds its
    bearings from AUTONOMOUS_BACKLOG.md / AUTONOMOUS_LOG.md, so state survives
    between iterations.

    Robustness:
      * model failover - if the primary model errors, the next in the list is
        tried within the same iteration
      * loud failure - if every model fails for N consecutive iterations the
        loop aborts instead of spinning uselessly
      * clean stop - drop a STOP_OVERNIGHT file in the repo root

    The loop is detached from any interactive shell - stdout and stderr go to a
    log file, so it will not hold a terminal open.

.PARAMETER Hours
    Wall-clock window in hours. Default 8.

.PARAMETER CooldownSec
    Seconds to wait between iterations. Default 5.

.PARAMETER Branch
    Branch the agent must be on. Default overnight-auto-improve.

.PARAMETER Models
    Comma-separated model list, tried in order. Default kimi-k3 -> glm-5p3 ->
    the free OpenRouter MiniMax.

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
    [string]$Models = 'fireworks-ai/accounts/fireworks/models/kimi-k3,fireworks-ai/accounts/fireworks/models/glm-5p3,openrouter/minimax/minimax-m3.1-flash:free',
    [int]$MaxConsecutiveFailures = 5,
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
$modelList = $Models -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }

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
Say "watchdog start - opencode $($opencodeVer.Trim()) - window $Hours h - ends $($endTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Say "repo $repoRoot | branch $Branch | log $log"
Say "model failover order: $($modelList -join ' -> ')"

$iteration = 0
$consecutiveFailures = 0
$lastModel = ''

while ((Get-Date) -lt $endTime) {
    $iteration++

    if (Test-Path $StopFile) {
        Say 'STOP file detected - shutting down cleanly.'
        break
    }

    $remaining = [int]($endTime - (Get-Date)).TotalSeconds
    if ($remaining -le 0) { break }

    Say "--- iteration $iteration starting (${remaining}s remaining) ---"

    $message = @"
Read the attached `overnight_prompt.md` FIRST and follow it exactly.
It is your complete brief for this session. Begin at section 0 (ORIENTATION).
Do not ask questions - no one is there to answer them.
Work on the `$Branch` branch, run the full verification gate before every commit,
and keep going until the window closes.
"@

    $headBefore = (git rev-parse --short HEAD 2>$null)
    $outFile = Join-Path $LogDir "iter-$stamp-$iteration.log"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $usedModel = ''
    $code = 1
    $allOut = @()

    foreach ($model in $modelList) {
        Say "    trying model $model"
        try {
            if ($DryRun) {
                $out = "DRY RUN - model $model not launched."
                $code = 0
            } else {
                # NOTE: the message must come BEFORE --file, otherwise the
                # positional is swallowed by the --file array option.
                $out = & opencode run --auto --print-logs --log-level INFO `
                    --title "overnight-iter-$iteration" -m $model $message `
                    "--file=$PromptFile" 2>&1
                $code = $LASTEXITCODE
            }
        } catch {
            $out = $_ | Out-String
            $code = 1
        }
        $allOut += "===== model: $model (exit $code) ====="
        $allOut += ($out | Out-String)
        if ($code -eq 0) { $usedModel = $model; break }
        Say "    model $model failed (exit $code) - trying next"
    }
    $sw.Stop()

    $allOut | Out-File -LiteralPath $outFile -Encoding UTF8
    $headAfter = (git rev-parse --short HEAD 2>$null)

    if ($code -eq 0) {
        $consecutiveFailures = 0
        $lastModel = $usedModel
        Say "--- iteration $iteration done: OK via $usedModel in $([int]$sw.Elapsed.TotalSeconds)s; HEAD $headBefore -> $headAfter ---"
    } else {
        $consecutiveFailures++
        Say "--- iteration $iteration FAILED: every model errored (exit $code) in $([int]$sw.Elapsed.TotalSeconds)s; HEAD $headBefore -> $headAfter ---"
        if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
            Say "FATAL: $consecutiveFailures consecutive failed iterations - aborting the loop rather than spinning."
            @{ status = 'aborted'; reason = "$consecutiveFailures consecutive failures"; iteration = $iteration
               head = $headAfter; ended = (Get-Date).ToString('o'); log = $log } |
                ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8
            break
        }
    }

    $record = [ordered]@{
        iteration   = $iteration
        started_utc = (Get-Date).ToUniversalTime().ToString('o')
        exit_code   = $code
        model       = $usedModel
        seconds     = [int]$sw.Elapsed.TotalSeconds
        head_before = $headBefore
        head_after  = $headAfter
        log         = $outFile
    }
    Add-Content -LiteralPath $iterations -Value ($record | ConvertTo-Json -Compress) -Encoding UTF8

    @{ status = 'running'; iteration = $iteration; head = $headAfter; model = $usedModel
       ends = $endTime.ToString('o'); log = $log } |
        ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8

    if (Test-Path $StopFile) {
        Say 'STOP file detected - shutting down cleanly.'
        break
    }

    if ((Get-Date) -lt $endTime) { Start-Sleep -Seconds $CooldownSec }
}

Say "watchdog finished after $iteration iteration(s). Window closed."
@{ status = 'finished'; iterations = $iteration; model = $lastModel
   head = (git rev-parse --short HEAD 2>$null)
   ended = (Get-Date).ToString('o'); log = $log } |
    ConvertTo-Json | Set-Content -LiteralPath $status -Encoding UTF8

Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
exit 0
