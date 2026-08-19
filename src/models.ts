"use strict";
import * as semver from "semver";
import * as url from "url";

import * as tl from 'azure-pipelines-task-lib/task';

import * as utils from "./versionutilities";

export class VersionInfo {
    private version: string;
    private files: VersionFilesData[];
    private packageType: string;
    private runtimeVersion: string;

    private vsVersion: string = "";

    constructor(versionInfoObject: { version: string, files: { name: string, hash: string, url: string, rid: string }[], 'runtime-version': string, 'vs-version': string }, packageType: string) {
        if (!versionInfoObject.version || !versionInfoObject.files) {
            throw `Releases.json has a release with invalid ${packageType} object: ${JSON.stringify(versionInfoObject)}`;
        }

        this.version = versionInfoObject.version;
        this.packageType = packageType;
        this.files = [];
        versionInfoObject.files.forEach(fileData => {
            try {
                this.files.push(new VersionFilesData(fileData));
            }
            catch (ex) {
                tl.debug(`In release ${this.packageType} for version ${this.version}, File data is incorrect (might have missing required fields, such as name, rid and url): ${ex}`);
            }
        });

        if (this.packageType == utils.Constants.sdk) {
            this.runtimeVersion = versionInfoObject["runtime-version"] || "";
            this.vsVersion = versionInfoObject["vs-version"] || "";
        }
        else {
            this.runtimeVersion = this.version;
        }
    }

    public getVersion(): string {
        return this.version;
    }

    public getFiles(): VersionFilesData[] {
        return this.files;
    }

    public getRuntimeVersion(): string {
        return this.runtimeVersion;
    }

    public getPackageType(): string {
        return this.packageType;
    }

    public getvsVersion(): string {
        return this.vsVersion;
    }
}

export class VersionFilesData {
    public name: string;
    public url: string;
    public rid: string;
    public hash?: string;

    constructor(versionFilesData: any) {
        if (!versionFilesData || !versionFilesData.name || !versionFilesData.url || !versionFilesData.rid) {
            throw `Version's files data is missing or has missing required fields.`;
        }

        this.name = versionFilesData.name;
        this.url = versionFilesData.url;
        this.rid = versionFilesData.rid;
        this.hash = versionFilesData.hash;
    }
}

export class Channel {
    constructor(channelRelease: any) {
        if (!channelRelease || !channelRelease["channel-version"] || !channelRelease["releases.json"]) {
            throw `Object cannot be used as Channel, required properties such as channel-version, releases.json is missing.`;
        }

        this.channelVersion = channelRelease["channel-version"];
        this.releasesJsonUrl = channelRelease["releases.json"];

        if (!channelRelease["support-phase"]) {
            tl.debug(`support-phase is not present in the channel with channel-version ${this.channelVersion}.`);
        }
        else {
            this.supportPhase = channelRelease["support-phase"];
        }
    }

    public channelVersion: string;
    public releasesJsonUrl: string;
    public supportPhase: string = "";
}

export class VersionParts {
    constructor(version: string, explicitVersion: boolean = false) {
        if (explicitVersion) {
            VersionParts.ValidateExplicitVersionNumber(version);
        } else {
            VersionParts.ValidateVersionSpec(version);
        }
        this.versionSpec = version;
        let parts: string[] = version.split(".");
        this.majorVersion = parts[0];
        this.minorVersion = parts[1];
        this.patchVersion = "";
        if (this.minorVersion != "x") {
            this.patchVersion = parts[2];
        }
    }

    /**
     * Validate the version if this string is a explicit version number. Returns an exception if the version number is not explicit.
     * @param version the input version number as string
     */
    private static ValidateExplicitVersionNumber(version: string): void {
        try {
            let parts = version.split('.');
            // validate version
            if ((parts.length < 3) || // check if the version has at least 3 parts
                !parts[0] || // The major version must always be set
                !parts[1] || // The minor version must always be set
                !parts[2] || // The patch version must always be set
                Number.isNaN(Number.parseInt(parts[0])) || // the major version number must be a number
                Number.isNaN(Number.parseInt(parts[1])) || // the minor version number must be a number
                Number.isNaN(Number.parseInt(parts[2].split(/\-|\+/)[0])) // the patch version number must be a number. (the patch version can have a '-', or a '+' because of version numbers like: 1.0.0-beta-50)
            ) {
                throw `Only explicit versions are accepted, such as: 2.2.301. Version: ${version} is not valid.`;
            }

            if (!semver.valid(version)) {
                throw `Invalid version specified: ${version}`;
            }
        }
        catch (ex) {
            throw `Version ${version} is not allowed. Allowed version types are: majorVersion.x, majorVersion.minorVersion.x, majorVersion.minorVersion.patchVersion. More details: ${ex}`;
        }
    }

    /**
     * Validate the version. Returns an exception if the version number is wrong.
     * @param version the input version number as string
     */
    private static ValidateVersionSpec(version: string): void {
        try {
            let parts = version.split('.');
            // validate version
            if (parts.length < 2 || // check if the version has at least 3 parts
                (parts[1] == "x" && parts.length > 2) ||  // a version number like `1.x` must have only major and minor version
                (parts[1] != "x" && parts.length <= 2) ||  // a version number like `1.1` must have a patch version
                !parts[0] || // The major version must always be set
                !parts[1] || // The minor version must always be set
                (parts.length == 3 && !parts[2]) || // a version number like `1.1.` is invalid because the patch version is missing
                Number.isNaN(Number.parseInt(parts[0])) || // the major version number must be a number
                (
                    parts[1] != "x" && // if the minor version is not `x`
                    (
                        Number.isNaN(Number.parseInt(parts[1])) || // the minor version number must be a number
                        (
                            parts.length > 2 && parts[2] != "x" && // if the patch is not `x`, then its an explicit version
                            !semver.valid(version) // validate the explicit version
                        )
                    )
                )
            ) {
                throw `The version number: ${version} doesn't have the correct format. Versions can be given in the following formats: 2.x   => Install latest in major version. 2.2.x => Install latest in major and minor version. 2.2.104 => Install exact version. Find the value of ${version} for installing SDK/Runtime, from the releases.json. The link to releases.json of that major.minor version can be found in [**releases-index file.**](https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json). Like link to releases.json for 2.2 version is https://builds.dotnet.microsoft.com/dotnet/release-metadata/2.2/releases.json`;
            }

            new semver.Range(version);
        }
        catch (ex) {
            throw `Version ${version} is not allowed. Allowed version types are: majorVersion.x, majorVersion.minorVersion.x, majorVersion.minorVersion.patchVersion. More details: ${ex}`;
        }
    }

    public majorVersion: string;
    public minorVersion: string;
    public patchVersion: string;
    /**
     * the version number entered by the user
     */
    public versionSpec: string;
}
