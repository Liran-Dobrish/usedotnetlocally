$baseurl="https://builds.dotnet.microsoft.com/dotnet"
$url="$baseurl/release-metadata/releases-index.json"
$releases=invoke-restmethod -Uri $url -usedefaultcredentials 
$releases."releases-index" | Select-Object  channel-version,latest-sdk,support-phase,release-type,releases.json | format-table -autosize
    