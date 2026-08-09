param(
    [string]$downloadPath = ".\Downloads"
)

$RequestedVersions = @(
    @{
        version  = "10.0"
        platform = @("win-x64", "linux-x64")
        sdk      = @("10.0.302")
        runtime  = @()
    },
    @{
        version  = "8.0"
        platform = @("win-x64", "linux-x64")
        sdk      = @("8.0.129")
        runtime  = @()
    }
)

if (!(Test-Path "$downloadPath\release-metadata")) {
    new-item -Path "$downloadPath\release-metadata" -ItemType Directory -Force
}

$baseurl = "https://builds.dotnet.microsoft.com/dotnet"
$url = "$baseurl/release-metadata/releases-index.json"
invoke-restmethod -Uri $url -usedefaultcredentials -OutFile "$downloadPath\release-metadata\releases-index.json"
$releasesIndex = Get-Content "$downloadPath\release-metadata\releases-index.json" | ConvertFrom-Json
$versionsIndex = $releasesIndex."releases-index" | Select-Object  channel-version, latest-sdk, support-phase, release-type, releases.json

foreach ($reqVer in $RequestedVersions) {
    $findVer = $versionsIndex | Where-Object { $reqVer.version -contains $_."channel-version" }
    $chnnlDownloadPath = [System.IO.Path]::Combine("$downloadPath", "release-metadata", $findVer.'channel-version')
        
    if (!(Test-Path "$chnnlDownloadPath")) {
        new-item -Path "$chnnlDownloadPath" -ItemType Directory -Force
    }

    invoke-restmethod -Uri  $findVer.'releases.json' -usedefaultcredentials -OutFile "$chnnlDownloadPath\releases.json"
    $releases = Get-Content "$chnnlDownloadPath\releases.json" | convertfrom-json
    $rel = $releases | where-object { $_.'channel-version' -eq $findVer.'channel-version' }
    $sdks = $rel.releases.sdks | where { $_.version -eq $reqver.sdk }
    
    $sdkDownloadPath = [System.IO.Path]::Combine("$downloadPath", "Sdk", $sdks.version)
    if (!(Test-Path "$sdkDownloadPath")) {
        new-item -Path "$sdkDownloadPath" -ItemType Directory -Force
    }

    foreach ($sdkplatform in $reqVer.platform) {
        $sdks.files | where { $_.name.contains($sdkplatform) } |foreach {
            curl.exe $_.url -o "$sdkDownloadPath\$($_.name)"
            #Invoke-RestMethod -Uri $_.url -OutFile "$sdkDownloadPath\$($_.name)"
        }   
    }
    
}