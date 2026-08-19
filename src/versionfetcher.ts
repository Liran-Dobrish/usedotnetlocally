"use strict";
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import * as tl from 'azure-pipelines-task-lib/task';
import * as trm from 'azure-pipelines-task-lib/toolrunner';

import httpClient = require("typed-rest-client/HttpClient");
import httpInterfaces = require("typed-rest-client/Interfaces");

import { VersionInfo, Channel, VersionFilesData, VersionParts } from "./models"
import * as utils from "./versionutilities";

const nodeVersion = parseInt(process.version.split('.')[0].replace('v', ''));
if (nodeVersion > 16) {
    require("dns").setDefaultResultOrder("ipv4first");
    tl.debug("Set default DNS lookup order to ipv4 first");
}

if (nodeVersion > 19) {
    require("net").setDefaultAutoSelectFamily(false);
    tl.debug("Set default auto select family to false");
}

export class DotNetCoreVersionFetcher {
    private explicitVersioning: boolean = false;
    private channels: Channel[];
    private httpCallbackClient: httpClient.HttpClient;
    private machineOsSuffixes: string[] = [];
    constructor(explicitVersioning: boolean = false) {
        this.explicitVersioning = explicitVersioning;
        let proxyUrl: string = tl.getVariable("agent.proxyurl") || "";
        const timeout: number = this.getRequestTimeout();
        var requestOptions: httpInterfaces.IRequestOptions = {
            allowRetries: true,
            maxRetries: 3,
            socketTimeout: timeout,
            globalAgentOptions: {
                timeout: timeout
            }
        };

        if (proxyUrl) {
            requestOptions.proxy = {
                proxyUrl: proxyUrl,
                proxyUsername: tl.getVariable("agent.proxyusername"),
                proxyPassword: tl.getVariable("agent.proxypassword"),
                proxyBypassHosts: tl.getVariable("agent.proxybypasslist") ? JSON.parse(tl.getVariable("agent.proxybypasslist") || "{}") : null
            }
        }

        this.httpCallbackClient = new httpClient.HttpClient(tl.getVariable("AZURE_HTTP_USER_AGENT"), [], requestOptions);
        this.channels = [];
    }

    public async getVersionInfo(versionSpec: string, vsVersionSpec: string, packageType: string, includePreviewVersions: boolean, matchingVersionSpec?: string): Promise<VersionInfo> {
        var requiredVersionInfo: VersionInfo | null | undefined = null;
        if (!this.channels || this.channels.length < 1) {
            await this.setReleasesIndex();
        }

        let effectiveMatchingSpec = matchingVersionSpec || versionSpec;

        let channelInformation: Channel | null | undefined = this.getVersionChannel(versionSpec, includePreviewVersions);
        if (channelInformation) {
            requiredVersionInfo = await this.getVersionFromChannel(channelInformation, effectiveMatchingSpec, vsVersionSpec, packageType, includePreviewVersions);
        }

        if (!!requiredVersionInfo && channelInformation) {
            console.log(`Found version ${requiredVersionInfo.getVersion()} in channel ${channelInformation.channelVersion} for user specified version spec: ${effectiveMatchingSpec}`);
        }
        else {
            console.log(`No matching ${packageType} version could be found for specified version: ${effectiveMatchingSpec}. Kindly note the preview versions are only considered in latest version searches if Include Preview Versions checkbox is checked.`);
            if (!versionSpec.endsWith("x")) {
                console.log(`Version ${versionSpec} could not be found in its channel, will now search in adjacent channels.`);
                requiredVersionInfo = await this.getVersionFromOtherChannels(versionSpec, effectiveMatchingSpec, vsVersionSpec, packageType, includePreviewVersions);
            }
        }

        if (!requiredVersionInfo) {
            throw `${packageType} version matching: ${effectiveMatchingSpec} could not be found`;
        }

        let dotNetSdkVersionTelemetry = `{"userVersion":"${effectiveMatchingSpec}", "resolvedVersion":"${requiredVersionInfo.getVersion()}"}`;
        console.log("##vso[telemetry.publish area=TaskDeploymentMethod;feature=UseDotNetV2]" + dotNetSdkVersionTelemetry);
        return requiredVersionInfo;
    }

    public getDownloadUrl(versionInfo: VersionInfo): string {
        console.log(`Getting URL to download .NET Core ${versionInfo.getPackageType()} version: ${versionInfo.getVersion()}`);

        this.detectMachineOS();
        let downloadPackageInfoObject: VersionFilesData | undefined = undefined;
        for (const osSuffix of this.machineOsSuffixes) {
            downloadPackageInfoObject = versionInfo.getFiles().find((downloadPackageInfo: VersionFilesData) => {
                if (downloadPackageInfo.rid &&
                    osSuffix &&
                    downloadPackageInfo.rid.toLowerCase() == osSuffix.toLowerCase() &&
                    (versionInfo.getPackageType() === "sdk" ||
                        (versionInfo.getPackageType() === "runtime" &&
                            downloadPackageInfo.name.startsWith("dotnet-runtime")))) {

                    if ((osSuffix.split("-")[0] == "win" && downloadPackageInfo.name.endsWith(".zip")) ||
                        (osSuffix.split("-")[0] != "win" && downloadPackageInfo.name.endsWith("tar.gz"))) {
                        return true;
                    }
                }

                return false;
            });

            if (downloadPackageInfoObject) {
                break;
            }
        }

        if (downloadPackageInfoObject !== undefined &&
            downloadPackageInfoObject.url != undefined) {
            tl.debug("Got download URL for platform with rid: " + downloadPackageInfoObject.rid);

            let releasesIndexUrlInput = tl.getInput("localreleasesindexurl") || "";
            let packageObjectUrl = downloadPackageInfoObject.url
            if (releasesIndexUrlInput != "") {
                packageObjectUrl = downloadPackageInfoObject.url.replaceAll("https://builds.dotnet.microsoft.com/dotnet", releasesIndexUrlInput);
            }
            return packageObjectUrl;
        }

        throw `Download URL for .Net Core ${versionInfo.getPackageType()} version ${versionInfo.getVersion()} could not be found for the following OS platforms (rid): ${this.machineOsSuffixes.toString()}`
    }

    private setReleasesIndex(): Promise<void> {
        let releasesIndexUrlInput = tl.getInput("localreleasesindexurl") || "";
        let DotNetCoreIndexUrl = DotNetCoreReleasesIndexUrl
        if (releasesIndexUrlInput != "") {
            DotNetCoreIndexUrl = DotNetCoreReleasesIndexUrl.replaceAll("https://builds.dotnet.microsoft.com/dotnet", releasesIndexUrlInput);
        }
        //console.log(DotNetCoreIndexUrl);

        return this.httpCallbackClient.get(DotNetCoreIndexUrl)
            .then((response: httpClient.HttpClientResponse) => {
                return response.readBody();
            })
            .then((body: string) => {
                let parsedReleasesIndexBody = JSON.parse(body);
                if (!parsedReleasesIndexBody || !parsedReleasesIndexBody["releases-index"] || parsedReleasesIndexBody["releases-index"].length < 1) {
                    throw `Parsed releases index body is not correct. Kindly see if the releases-index section is not empty in the file.`;
                }

                parsedReleasesIndexBody["releases-index"].forEach((channelRelease: any) => {
                    if (channelRelease) {
                        try {
                            this.channels.push(new Channel(channelRelease));
                        }
                        catch (ex: any) {
                            tl.debug("Channel information in releases-index.json was not proper. Error: " + ex.message);
                            // do not fail, try to find version in the available channels.
                        }
                    }
                });
            })
            .catch((ex) => {
                throw `Failed to download or parse releases-index.json with error: ${ex.message}`;
            });
    }

    private getVersionChannel(versionSpec: string, includePreviewVersions: boolean): Channel | undefined {
        let versionParts = new VersionParts(versionSpec, this.explicitVersioning);

        let requiredChannelVersion = `${versionParts.majorVersion}.${versionParts.minorVersion}`;
        if (versionParts.minorVersion == "x") {
            var latestChannelVersion: string = "";
            this.channels.forEach(channel => {
                // Checks if the channel is in preview state, if so then only select the channel if includePreviewVersion should be true.
                // As a channel with state in preview will only have preview releases.
                // example: versionSpec: 3.x Channels: 3.0 (current), 3.1 (preview).
                // if (includePreviewVersion == true) select 3.1
                // else select 3.0
                let satisfiesPreviewCheck: boolean = (includePreviewVersions || (!channel.supportPhase || channel.supportPhase.toLowerCase() !== "preview"));
                if (satisfiesPreviewCheck && channel.channelVersion.startsWith(versionParts.majorVersion) && (!latestChannelVersion || utils.compareChannelVersion(channel.channelVersion, latestChannelVersion) > 0)) {
                    latestChannelVersion = channel.channelVersion;
                }
            });

            requiredChannelVersion = latestChannelVersion;
        }

        tl.debug(`Finding channel ${requiredChannelVersion} for version ${versionSpec}`);
        if (!!requiredChannelVersion) {
            return this.channels.find(channel => {
                if (channel.channelVersion == requiredChannelVersion) {
                    return true
                }
            });
        }
    }

    private async getVersionFromChannel(channelInformation: Channel, versionSpec: string, vsVersionSpec: string, packageType: string, includePreviewVersions: boolean): Promise<VersionInfo | undefined> {
        var releasesJsonUrl: string = channelInformation.releasesJsonUrl;

        if (releasesJsonUrl) {
            return this.httpCallbackClient.get(releasesJsonUrl)
                .then((response: httpClient.HttpClientResponse) => {
                    return response.readBody();
                })
                .then((body: string) => {
                    var channelReleases = JSON.parse(body).releases;

                    let versionInfoList: VersionInfo[] = [];
                    channelReleases.forEach((release: any) => {
                        if (release && packageType === 'sdk' && release.sdks) {
                            try {
                                release.sdks.forEach((sdk: any) => {
                                    let versionInfo: VersionInfo = new VersionInfo(sdk, packageType);

                                    if (!versionInfo.getvsVersion() || !vsVersionSpec || (vsVersionSpec == versionInfo.getvsVersion())) {
                                        versionInfoList.push(versionInfo);
                                    }
                                });
                            }
                            catch (err) {
                                tl.debug(`Version: ${release[packageType].version} required information is not complete in releases.json file. Error: ${err}`);
                            }
                        }
                        if (release && release[packageType] && release[packageType].version && !versionInfoList.find((versionInfo) => { return versionInfo.getVersion() === release[packageType].version })) {
                            try {
                                let versionInfo: VersionInfo = new VersionInfo(release[packageType], packageType);

                                if (!versionInfo.getvsVersion() || !vsVersionSpec || (vsVersionSpec == versionInfo.getvsVersion())) {
                                    versionInfoList.push(versionInfo);
                                }
                            }
                            catch (err) {
                                tl.debug(`Version: ${release[packageType].version} required information is not complete in releases.json file. Error: ${err}`);
                            }
                        }
                    });

                    return utils.getMatchingVersionFromList(versionInfoList, versionSpec, includePreviewVersions);
                })
                .catch((ex) => {
                    tl.error(`Failed while getting version ${versionSpec} from channel ${channelInformation.channelVersion} with error: ${ex.message}`);
                    return undefined;
                });
        }
        else {
            tl.error(`Could not find URL for releases.json of channel version: ${channelInformation.channelVersion}`);
        }

    }

    private async getVersionFromOtherChannels(channelLookupVersion: string, matchingVersion: string, vsVersionSpec: string, packageType: string, includePreviewVersions: boolean): Promise<VersionInfo | undefined | null> {
        let fallbackChannels: Channel[] = this.getChannelsForMajorVersion(channelLookupVersion);
        if (fallbackChannels != undefined && fallbackChannels.length < 1) {
            throw `Channel corresponding to version ${channelLookupVersion} could not be found.`;
        }

        var versionInfo: VersionInfo | undefined | null = null;
        for (var i = 0; i < fallbackChannels.length; i++) {
            console.log(`Searching for version in channel ${fallbackChannels[i].channelVersion}`);
            versionInfo = await this.getVersionFromChannel(fallbackChannels[i], matchingVersion, vsVersionSpec, packageType, includePreviewVersions);

            if (versionInfo) {
                break;
            }
        }

        return versionInfo;
    }

    private getChannelsForMajorVersion(version: string): Channel[] {
        var versionParts = new VersionParts(version, this.explicitVersioning);
        let adjacentChannels: Channel[] = [];
        this.channels.forEach(channel => {
            if (channel.channelVersion.startsWith(`${versionParts.majorVersion}`)) {
                adjacentChannels.push(channel);
            }
        });

        return adjacentChannels;
    }

    private detectMachineOS(): void {
        if (this.machineOsSuffixes.length == 0) {
            let osSuffix = [];
            let scriptRunner: trm.ToolRunner;

            try {
                console.log(`Detecting OS platform to find correct download package for the OS.`);
                if (tl.getPlatform() == tl.Platform.Windows) {
                    let escapedScript = path.join(this.getCurrentDir(), 'externals', 'get-os-platform.ps1').replace(/'/g, "''");
                    let command = `& '${escapedScript}'`;

                    let powershellPath = tl.which('powershell', true);
                    scriptRunner = tl.tool(powershellPath)
                        .line('-NoLogo -Sta -NoProfile -NonInteractive -ExecutionPolicy Unrestricted -Command')
                        .arg(command);
                }
                else {
                    let scriptPath = path.join(this.getCurrentDir(), 'externals', 'get-os-distro.sh');
                    this.setFileAttribute(scriptPath, "755");

                    scriptRunner = tl.tool(tl.which(scriptPath, true));
                }
                let result: trm.IExecSyncResult = scriptRunner.execSync();
                if (result.code != 0) {
                    throw `Failed to get machine platform details. Error: ${result.error ? result.error.message : result.stderr}.`;
                }

                let output: string = result.stdout;

                let index;

                if ((index = output.indexOf("Primary:")) >= 0) {
                    let primary = output.substring(index + "Primary:".length).split(os.EOL)[0];
                    osSuffix.push(primary);
                    console.log(`Detected platform (Primary): ${primary}`);
                }

                if ((index = output.indexOf("Legacy:")) >= 0) {
                    let legacy = output.substring(index + "Legacy:".length).split(os.EOL)[0];
                    osSuffix.push(legacy);
                    console.log(`Detected platform (Legacy): ${legacy}`);
                }

                if (osSuffix.length == 0) {
                    throw `Could not detect the machine's OS`
                }
            }
            catch (ex: any) {
                throw `Failed while detecting machine OS platform with error: ${ex.message}`;
            }

            this.machineOsSuffixes = osSuffix;
        }
    }

    private setFileAttribute(file: string, mode: string): void {
        fs.chmodSync(file, mode);
    }

    private getCurrentDir(): string {
        return __dirname;
    }

    private getRequestTimeout(): number {
        let timeout = 60_000 * 5;
        const inputValue: string = tl.getInput('requestTimeout', false) || "";
        if (!(Number.isNaN(Number(inputValue)))) {
            const maxTimeout = 60_000 * 10;
            timeout = Math.min(parseInt(inputValue), maxTimeout);
        }
        return timeout;
    }
}

const DotNetCoreReleasesIndexUrl: string = "https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json";
