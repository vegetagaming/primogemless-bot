param([string]$Destination = (Join-Path $PSScriptRoot '.local\token.xml'), [switch]$FromStdin)
$ErrorActionPreference = 'Stop'
try {
    if ($FromStdin) {
        $plain = [Console]::In.ReadLine()
        if ($plain -notmatch '^\d+:[A-Za-z0-9_-]{30,}$') { throw 'Invalid token' }
        $secret = ConvertTo-SecureString $plain -AsPlainText -Force
        $plain = $null
    } else { $secret = Read-Host 'Telegram bot token (hidden)' -AsSecureString }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Destination)))
    $secret | Export-Clixml -LiteralPath $Destination
    Write-Output 'Token encrypted for this Windows user on this PC.'
} catch { Write-Error 'Could not protect the token.'; exit 1 }
finally { $plain=$null; $secret=$null }
