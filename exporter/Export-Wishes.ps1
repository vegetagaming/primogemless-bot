param(
    [string]$GameFolder = '',
    [string]$Destination = '',
    [switch]$InspectOnly
)
# Local, read-only helper for global Genshin servers. Review README.txt first.
Add-Type -AssemblyName System.Web
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
if (-not $GameFolder) { $GameFolder = Join-Path $env:ProgramFiles 'HoYoPlay\games\Genshin Impact game' }
if (-not (Test-Path -LiteralPath (Join-Path $GameFolder 'GenshinImpact_Data\webCaches'))) {
    $GameFolder = (Read-Host 'Genshin game folder (the folder containing GenshinImpact.exe)').Trim('"')
}
$gameRoot = $GameFolder
if (-not $Destination) { $Destination = Join-Path $PSScriptRoot 'Exports' }
$outputRoot = $Destination
$failureCode = 'INITIALIZATION'
$client = $null
$cacheBytes = $null
$cacheText = $null
$candidates = $null
$selected = $null
$baseParams = $null
$requestUri = $null
$response = $null
$responseText = $null

function Read-SharedBytes([string]$path) {
    $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
    try {
        if ($stream.Length -gt 20000000) { throw 'Unexpected cache size' }
        $bytes = [byte[]]::new([int]$stream.Length)
        $read = 0
        while ($read -lt $bytes.Length) {
            $amount = $stream.Read($bytes, $read, $bytes.Length - $read)
            if ($amount -eq 0) { break }
            $read += $amount
        }
        return ,$bytes
    } finally { $stream.Dispose() }
}

function New-CleanWish($row) {
    if ([string]$row.id -notmatch '^\d{1,19}$' -or [string]$row.uid -notmatch '^\d+$' -or [string]$row.time -notmatch '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$') { throw 'Invalid record' }
    if ([string]$row.gacha_type -notin @('100','200','301','302','400','500')) { throw 'Unexpected banner type' }
    if ([string]$row.rank_type -notin @('3','4','5') -or [string]$row.item_id -notmatch '^\d*$') { throw 'Invalid item' }
    foreach ($value in @([string]$row.name,[string]$row.item_type)) {
        if ($value.Length -gt 300 -or $value -match '(?i)https?://|authkey|cookie_token|access_token|[\x00-\x08]') { throw 'Unexpected record contents' }
    }
    return [pscustomobject][ordered]@{
        uigf_gacha_type = $(if ([string]$row.gacha_type -eq '400') {'301'} else {[string]$row.gacha_type})
        gacha_type = [string]$row.gacha_type
        item_id = [string]$row.item_id
        count = [string]$row.count
        time = [string]$row.time
        name = [string]$row.name
        item_type = [string]$row.item_type
        rank_type = [string]$row.rank_type
        id = [string]$row.id
    }
}

try {
    $failureCode = 'CACHE_READ'
    $cacheFiles = @(Get-ChildItem -LiteralPath (Join-Path $gameRoot 'GenshinImpact_Data\webCaches') -Directory | ForEach-Object {
        Get-Item -LiteralPath (Join-Path $_.FullName 'Cache\Cache_Data\data_2') -ErrorAction SilentlyContinue
    } | Sort-Object LastWriteTimeUtc -Descending)
    if ($cacheFiles.Count -eq 0) { throw 'No cache' }
    $cacheBytes = Read-SharedBytes $cacheFiles[0].FullName
    $cacheText = [Text.Encoding]::UTF8.GetString($cacheBytes)
    $candidates = [Collections.Generic.List[object]]::new()
    foreach ($urlMatch in [regex]::Matches($cacheText, 'https://[^\x00-\x20"<>]{1,16000}')) {
        if ($urlMatch.Value -notmatch 'webview_gacha' -or $urlMatch.Value -notmatch 'authkey=') { continue }
        $candidateUri = $null
        if (-not [Uri]::TryCreate($urlMatch.Value, [UriKind]::Absolute, [ref]$candidateUri)) { continue }
        if ($candidateUri.DnsSafeHost -notin @('gs.hoyoverse.com','webstatic-sea.hoyoverse.com','webstatic-sea.mihoyo.com','public-operation-hk4e-sg.hoyoverse.com')) { continue }
        $parsedQuery = [System.Web.HttpUtility]::ParseQueryString($candidateUri.Query)
        if ($parsedQuery['auth_appid'] -ne 'webview_gacha' -or $parsedQuery['authkey'].Length -lt 100) { continue }
        $linkTime = 0L
        [void][long]::TryParse($parsedQuery['timestamp'], [ref]$linkTime)
        if ($linkTime -gt 99999999999) { $linkTime = [long][Math]::Floor($linkTime / 1000) }
        $candidates.Add([pscustomobject]@{query=$parsedQuery;timestamp=$linkTime;offset=$urlMatch.Index})
    }
    $failureCode = 'NO_WISH_LINK'
    if ($candidates.Count -eq 0) { throw 'No usable wish link' }
    $selected = $candidates | Sort-Object timestamp,offset -Descending | Select-Object -First 1
    $baseParams = [System.Web.HttpUtility]::ParseQueryString('')
    foreach ($parameter in @('authkey','authkey_ver','auth_appid','sign_type','game_biz','region','gacha_id','timestamp','device_type','game_version','init_type')) {
        if ($null -ne $selected.query[$parameter]) { $baseParams[$parameter] = $selected.query[$parameter] }
    }
    $baseParams['lang'] = 'en-us'
    $baseParams['size'] = '20'
    $baseParams['auth_appid'] = 'webview_gacha'
    $baseParams['sign_type'] = '2'
    $region = [string]$baseParams['region']
    $timezone = switch ($region) { 'os_usa' {-5} 'os_euro' {1} 'os_asia' {8} 'os_cht' {8} default {$null} }
    $failureCode = 'UNKNOWN_SERVER'
    if ($null -eq $timezone) { throw 'Unknown server' }
    if ($InspectOnly) {
        [pscustomobject]@{status='ready';region=$region;cache_modified=$cacheFiles[0].LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss zzz');link_time_utc=$(if ($selected.timestamp -gt 0) {[DateTimeOffset]::FromUnixTimeSeconds($selected.timestamp).UtcDateTime.ToString('yyyy-MM-dd HH:mm:ss')} else {'unknown'});credentials_printed=$false} | ConvertTo-Json
        exit 0
    }

    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $handler.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(25)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('GenshinWishExport/1.0')
    $records = [Collections.Generic.Dictionary[string,object]]::new()
    $bannerResults = [Collections.Generic.List[object]]::new()
    $accountUid = ''
    $bannerNames = @{'100'='Beginners';'200'='Standard';'301'='Character Event';'302'='Weapon Event';'400'='Character Event 2';'500'='Chronicled'}
    foreach ($banner in @('100','200','301','302','400','500')) {
        $page = 1
        $cursor = '0'
        $receivedCount = 0
        $emptyPageSeen = $false
        while ($page -le 2000) {
            $baseParams['gacha_type'] = $banner
            $baseParams['page'] = [string]$page
            $baseParams['end_id'] = $cursor
            $builder = [UriBuilder]::new('https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog')
            $builder.Query = $baseParams.ToString()
            $requestUri = $builder.Uri
            $decoded = $null
            for ($attempt = 1; $attempt -le 3; $attempt++) {
                $failureCode = 'NETWORK_REQUEST'
                try {
                    $response = $client.GetAsync($requestUri).GetAwaiter().GetResult()
                } catch {
                    if ($attempt -lt 3) { Start-Sleep -Seconds (2 * $attempt); continue }
                    throw 'Request failed'
                }
                $httpCode = [int]$response.StatusCode
                if (($httpCode -eq 429 -or $httpCode -ge 500) -and $attempt -lt 3) {
                    $response.Dispose(); $response = $null
                    Start-Sleep -Seconds (3 * $attempt)
                    continue
                }
                $failureCode = 'HTTP_' + [string]$httpCode
                if ($httpCode -ne 200) { throw 'HTTP request failed' }
                $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                $response.Dispose(); $response = $null
                $failureCode = 'INVALID_RESPONSE'
                $decoded = $responseText | ConvertFrom-Json
                $responseText = $null
                $apiCode = [int]$decoded.retcode
                if ($apiCode -ne 0) {
                    if ([string]$decoded.message -match '(?i)authkey|expired|timeout') { $failureCode = 'EXPIRED_OR_INVALID_WISH_LINK' }
                    else { $failureCode = 'API_' + [string]$apiCode }
                    if ([string]$decoded.message -match '(?i)frequen|too many' -and $attempt -lt 3) { Start-Sleep -Seconds (3 * $attempt); continue }
                    throw 'API rejected request'
                }
                break
            }
            $failureCode = 'INVALID_RESPONSE'
            if ($null -eq $decoded -or $null -eq $decoded.data -or $null -eq $decoded.data.list) { throw 'Missing list' }
            if ($decoded.data.region -and [string]$decoded.data.region -ne $region) { throw 'Server mismatch' }
            $rows = @($decoded.data.list)
            if ($rows.Count -eq 0) { $emptyPageSeen = $true; break }
            foreach ($row in $rows) {
                $failureCode = 'INVALID_WISH_RECORD'
                $clean = New-CleanWish $row
                if ($accountUid -eq '') { $accountUid = [string]$row.uid }
                $failureCode = 'ACCOUNT_MISMATCH'
                if ($accountUid -ne [string]$row.uid) { throw 'Account mismatch' }
                if (-not $records.ContainsKey($clean.id)) { $records.Add($clean.id, $clean) }
                elseif (($records[$clean.id] | ConvertTo-Json -Compress) -ne ($clean | ConvertTo-Json -Compress)) { $failureCode='DUPLICATE_RECORD_CONFLICT'; throw 'Conflicting record' }
            }
            $receivedCount += $rows.Count
            $nextCursor = [string]$rows[-1].id
            $failureCode = 'PAGINATION_STALLED'
            if ($nextCursor -eq $cursor) { throw 'Pagination did not advance' }
            $cursor = $nextCursor
            if ($page % 10 -eq 0) { Write-Host ($bannerNames[$banner] + ': ' + $receivedCount + ' records read') }
            $page++
            Start-Sleep -Milliseconds 1200
        }
        $failureCode = 'PAGINATION_LIMIT'
        if (-not $emptyPageSeen) { throw 'Pagination limit reached' }
        $bannerResults.Add([pscustomobject]@{queried_type=$banner;name=$bannerNames[$banner];records_returned=$receivedCount;pages_with_records=$page-1;end_confirmed=$true})
        Write-Host ($bannerNames[$banner] + ': complete (' + $receivedCount + ' records returned)')
        Start-Sleep -Milliseconds 1200
    }
    $failureCode = 'NO_AVAILABLE_HISTORY'
    if ($records.Count -eq 0 -or $accountUid -eq '') { throw 'No wish records' }
    # Fill missing IDs from the bundled public UIGF name dictionary, in memory.
    $failureCode = 'ITEM_DICTIONARY'
    $dictionaryPath = Join-Path $PSScriptRoot 'item-dictionary.json'
    $dictionary = [IO.File]::ReadAllText($dictionaryPath) | ConvertFrom-Json
    foreach ($record in $records.Values) {
        if ($record.item_id -eq '') {
            $property = $dictionary.PSObject.Properties[$record.name]
            if ($null -ne $property -and [string]$property.Value -match '^\d+$') { $record.item_id = [string]$property.Value }
        }
    }
    $sortedRecords = @($records.Values | Sort-Object { [decimal]$_.id })
    $export = [ordered]@{
        info = [ordered]@{export_timestamp=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();export_app='Local read-only wish export';export_app_version='1.0';version='v4.2'}
        hk4e = @([ordered]@{uid=$accountUid;timezone=[int]$timezone;lang='en-us';list=$sortedRecords})
    }
    $jsonOut = $export | ConvertTo-Json -Depth 9
    $failureCode = 'EXPORT_SECRET_CHECK'
    if ($jsonOut -match '(?i)authkey|cookie_token|access_token|https?://') { throw 'Unexpected export data' }
    if ($jsonOut.Contains([string]$baseParams['authkey']) -or $jsonOut.Contains([Uri]::EscapeDataString([string]$baseParams['authkey']))) { throw 'Credential found in export' }
    $failureCode = 'OUTPUT_WRITE'
    [void][IO.Directory]::CreateDirectory($outputRoot)
    $stamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss')
    $exportPath = Join-Path $outputRoot ('genshin-wishes-' + $stamp + '.uigf.json')
    [IO.File]::WriteAllText($exportPath, $jsonOut, [Text.UTF8Encoding]::new($false))
    $verification = [IO.File]::ReadAllText($exportPath) | ConvertFrom-Json
    $failureCode = 'EXPORT_VERIFICATION'
    if (@($verification.hk4e[0].list).Count -ne $records.Count) { throw 'Record count mismatch' }
    $summary = [ordered]@{
        export_file=$exportPath
        exported_at=[DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz')
        region=$region
        server_timezone=[int]$timezone
        unique_records=$records.Count
        earliest_record=($sortedRecords | Sort-Object time | Select-Object -First 1).time
        latest_record=($sortedRecords | Sort-Object time | Select-Object -Last 1).time
        counts_by_banner=@($sortedRecords | Group-Object uigf_gacha_type | ForEach-Object { [pscustomobject]@{type=$_.Name;name=$bannerNames[$_.Name];count=$_.Count} })
        records_without_item_id=@($sortedRecords | Where-Object { $_.item_id -eq '' }).Count
        queries=$bannerResults
        all_queried_categories_exhausted=$true
        limitation='Contains all records returned by the available history API at export time, not necessarily lifetime history. Very recent wishes may not have appeared yet. Character Event queries can overlap; records are deduplicated by ID.'
        credentials_saved=$false
        game_files_modified=$false
    }
    $summaryJson = $summary | ConvertTo-Json -Depth 7
    [IO.File]::WriteAllText((Join-Path $outputRoot ('genshin-wishes-' + $stamp + '-summary.json')), $summaryJson, [Text.UTF8Encoding]::new($false))
    Write-Host ('Saved ' + $records.Count + ' pulls to: ' + $exportPath)
    Write-Host 'Send only the .uigf.json file to the bot. Keep the summary for your records.'
} catch {
    # Never output raw exceptions, request URLs, response text, or token values.
    Write-Output ('EXPORT_STOPPED: ' + $failureCode + '. No access key was printed or written by this exporter.')
    Write-Host 'Reopen Wish History and wait for it to load, then try again. Very recent wishes may not be available yet.'
    exit 1
} finally {
    if ($null -ne $response) { $response.Dispose() }
    if ($null -ne $client) { $client.Dispose() }
    if ($null -ne $cacheBytes) { [Array]::Clear($cacheBytes, 0, $cacheBytes.Length) }
    $cacheText=$null; $candidates=$null; $selected=$null; $baseParams=$null
    $candidateUri=$null; $parsedQuery=$null; $urlMatch=$null; $builder=$null
    $requestUri=$null; $responseText=$null
    [GC]::Collect()
}
