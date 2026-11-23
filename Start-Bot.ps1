param(
    [string]$TokenFile = (Join-Path $PSScriptRoot '.local\token.xml'),
    [string]$DataDirectory = (Join-Path $PSScriptRoot '.local'),
    [string]$NodePath = 'node',
    [ValidateSet('Run','Setup','Check')][string]$Mode = 'Run'
)
$ErrorActionPreference = 'Stop'
$pointer = [IntPtr]::Zero
try {
    $secret = Import-Clixml -LiteralPath $TokenFile
    if ($secret -isnot [Security.SecureString]) { throw 'Invalid token file' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:TELEGRAM_BOT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $pointer = [IntPtr]::Zero
    $env:BOT_DATA_DIR = [IO.Path]::GetFullPath($DataDirectory)
    [void][IO.Directory]::CreateDirectory($env:BOT_DATA_DIR)
    $vaultFile = Join-Path $env:BOT_DATA_DIR 'vault-key.xml'
    if (-not (Test-Path -LiteralPath $vaultFile)) {
        $keyBytes = [byte[]]::new(32)
        $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
        $generator.GetBytes($keyBytes); $generator.Dispose()
        $keySecret = ConvertTo-SecureString ([Convert]::ToBase64String($keyBytes)) -AsPlainText -Force
        $keySecret | Export-Clixml -LiteralPath $vaultFile
        [Array]::Clear($keyBytes,0,$keyBytes.Length); $keySecret=$null
    }
    $keySecret = Import-Clixml -LiteralPath $vaultFile
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecret)
    $env:BOT_VAULT_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $pointer=[IntPtr]::Zero; $keySecret=$null
    $nodeArgs = @('--disable-warning=ExperimentalWarning', (Join-Path $PSScriptRoot 'src\main.mjs'))
    if ($Mode -eq 'Setup') { $nodeArgs += '--setup' }
    if ($Mode -eq 'Check') { $nodeArgs += '--check' }
    & $NodePath @nodeArgs
    exit $LASTEXITCODE
} catch { Write-Output 'Bot could not start. Check Node.js 24+, the token file and network access.'; exit 1 }
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    Remove-Item Env:\TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:\BOT_VAULT_KEY -ErrorAction SilentlyContinue
    $secret=$null
}
