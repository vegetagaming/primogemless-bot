param([string]$ConfigPath=(Join-Path $PSScriptRoot 'connection.json'))
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$stage='START';$ws=$null;$profile=$null;$sequence=0;$keys=$null;$plainBytes=$null
function BytesFromUrl64([string]$s){$s=$s.Replace('-','+').Replace('_','/');while($s.Length%4){$s+='='};return ,[Convert]::FromBase64String($s)}
function Cdp([string]$method,$parameters=@{}){
 $script:sequence++
 $bytes=[Text.Encoding]::UTF8.GetBytes((@{id=$script:sequence;method=$method;params=$parameters}|ConvertTo-Json -Depth 8 -Compress))
 $script:ws.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
 do {
  $memory=[IO.MemoryStream]::new();$buffer=[byte[]]::new(65536)
  do {$part=$script:ws.ReceiveAsync([ArraySegment[byte]]::new($buffer),[Threading.CancellationToken]::None).GetAwaiter().GetResult();if($part.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close){throw 'Browser closed'};$memory.Write($buffer,0,$part.Count);if($memory.Length -gt 2000000){throw 'Response size'}}while(-not $part.EndOfMessage)
  $reply=[Text.Encoding]::UTF8.GetString($memory.ToArray())|ConvertFrom-Json;$memory.Dispose()
 }while($reply.id -ne $script:sequence)
 if($reply.error){throw 'Browser request failed'}
 return $reply.result
}
try {
 $config=[IO.File]::ReadAllText($ConfigPath)|ConvertFrom-Json
 if($config.kind -ne 'primogemless-pair-v1' -or $config.challenge -notmatch '^[a-f0-9]{48}$' -or [string]$config.owner -notmatch '^\d+$'){throw 'Invalid configuration'}
 if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt [long]$config.expires){$stage='EXPIRED_PAIRING';throw 'Expired'}
 Write-Host 'PRIMOGEMLESS - Connect once, sync automatically' -ForegroundColor Cyan
 Write-Host 'Your login session will be encrypted and stored by the bot operator.'
 Write-Host 'This helper opens an isolated browser. Sign in ONLY on official HoYoverse pages.'
 Write-Host 'It never reads your existing browser profile or game files.'
 Write-Host 'The resulting connection file is encrypted for the bot and your Telegram account.'
 Write-Host ''
 [void](Read-Host 'Press Enter to connect, or close this window to cancel')
 $stage='FIND_BROWSER'
 $browser=@((Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),(Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')) | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
 if(-not $browser){throw 'Install Edge or Chrome'}
 $profile=Join-Path ([IO.Path]::GetTempPath()) ('Primogemless-Login-'+[Guid]::NewGuid().ToString('N'))
 [void][IO.Directory]::CreateDirectory($profile)
 $browserArguments=@(('--user-data-dir="'+$profile+'"'),'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','--new-window','https://www.hoyolab.com/','https://genshin.hoyoverse.com/en/gift')
 # A visible browser is necessary for the player's interactive official sign-in.
 $browserProcess=Start-Process -FilePath $browser -ArgumentList $browserArguments -PassThru
 Write-Host 'Sign in to HoYoLAB and the Genshin redemption page in the new browser tabs.'
 Write-Host 'Do not close the browser until this window says Connected package ready.'
 $stage='BROWSER_START'
 $portFile=Join-Path $profile 'DevToolsActivePort'
 $deadline=[DateTimeOffset]::UtcNow.AddSeconds(60)
 while(-not (Test-Path -LiteralPath $portFile)){if([DateTimeOffset]::UtcNow -gt $deadline){throw 'Browser unavailable'};Start-Sleep -Milliseconds 500}
 $port=[int]([IO.File]::ReadAllLines($portFile)[0])
 if($port -lt 1024 -or $port -gt 65535){throw 'Invalid local port'}
 $version=Invoke-RestMethod -Uri ('http://127.0.0.1:'+ $port +'/json/version') -TimeoutSec 10
 $socketUri=[Uri]$version.webSocketDebuggerUrl
 if($socketUri.Host -notin @('127.0.0.1','localhost') -or $socketUri.Port -ne $port){throw 'Unexpected browser endpoint'}
 $ws=[Net.WebSockets.ClientWebSocket]::new();$ws.ConnectAsync($socketUri,[Threading.CancellationToken]::None).GetAwaiter().GetResult()
 $stage='WAITING_FOR_LOGIN';$deadline=[DateTimeOffset]::UtcNow.AddMinutes(15)
 $allowed=@('account_id_v2','account_mid_v2','cookie_token_v2','ltuid_v2','ltmid_v2','ltoken_v2')
 do {
  $session=@{}
  $result=Cdp 'Storage.getCookies'
  foreach($cookie in $result.cookies){if($cookie.name -in $allowed -and $cookie.domain -match '(^|\.)(hoyolab|hoyoverse)\.com$' -and $cookie.value){$session[$cookie.name]=[string]$cookie.value}}
  $ready=$session['account_id_v2'] -and $session['account_mid_v2'] -and $session['cookie_token_v2'] -and $session['ltoken_v2']
  if($ready){break}
  if([DateTimeOffset]::UtcNow -gt $deadline -or [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -gt [long]$config.expires){throw 'Login timed out'}
  Start-Sleep -Seconds 2
 }while($true)
 $stage='ENCRYPT_PACKAGE'
 $keys=[byte[]]::new(64);$iv=[byte[]]::new(16);$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($keys);$rng.GetBytes($iv);$rng.Dispose()
 $aes=[Security.Cryptography.Aes]::Create();$aes.Key=[byte[]]$keys[0..31];$aes.IV=$iv;$aes.Mode=[Security.Cryptography.CipherMode]::CBC;$aes.Padding=[Security.Cryptography.PaddingMode]::PKCS7
 $plainBytes=[Text.Encoding]::UTF8.GetBytes(($session|ConvertTo-Json -Compress))
 $enc=$aes.CreateEncryptor();$cipher=$enc.TransformFinalBlock($plainBytes,0,$plainBytes.Length);$enc.Dispose();$aes.Dispose()
 $iv64=[Convert]::ToBase64String($iv);$data64=[Convert]::ToBase64String($cipher)
 $hmac=[Security.Cryptography.HMACSHA256]::new([byte[]]$keys[32..63]);$mac=$hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes(([string]$config.owner+'.'+$config.challenge+'.'+$iv64+'.'+$data64)));$hmac.Dispose()
 $rsa=[Security.Cryptography.RSACng]::new();$parameters=[Security.Cryptography.RSAParameters]::new();$parameters.Modulus=BytesFromUrl64 $config.publicKey.n;$parameters.Exponent=BytesFromUrl64 $config.publicKey.e;$rsa.ImportParameters($parameters)
 $wrapped=$rsa.Encrypt($keys,[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256);$rsa.Dispose()
 $package=@{kind='primogemless-connect-v1';challenge=$config.challenge;key=[Convert]::ToBase64String($wrapped);iv=$iv64;data=$data64;mac=[Convert]::ToBase64String($mac)}
 $destination=Join-Path $PSScriptRoot 'Primogemless.connect.json'
 [IO.File]::WriteAllText($destination,($package|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 Write-Host ''
 Write-Host 'Connection package ready.' -ForegroundColor Green
 Write-Host ('Send this ONE file to @Primogemless_bot: '+$destination)
 Write-Host 'After the bot confirms connection, future wishes sync automatically on the server.'
 Write-Host 'You can delete this encrypted file afterward. Use Disconnect in the bot to revoke its saved session.'
 try{[void](Cdp 'Browser.close')}catch{}
}catch{
 Write-Host ('Connection stopped: '+$stage+'. No raw credentials were printed or saved by this helper.') -ForegroundColor Yellow
 Write-Host 'Start again from /login. Sign in to both official tabs if the helper is waiting for login.'
}finally{
 if($null -ne $ws){$ws.Dispose()}
 if($keys){[Array]::Clear($keys,0,$keys.Length)}
 if($plainBytes){[Array]::Clear($plainBytes,0,$plainBytes.Length)}
 $session=$null;$result=$null;$cookie=$null
 # Only remove the isolated temporary profile created by this invocation.
 if($profile){
  $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
  $resolved=[IO.Path]::GetFullPath($profile)
  if($resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved) -match '^Primogemless-Login-[a-f0-9]{32}$'){
   Start-Sleep -Seconds 2
   try{Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop}catch{Write-Host 'Close the isolated browser and remove its temporary login folder if cleanup could not finish.'}
  }
 }
}
