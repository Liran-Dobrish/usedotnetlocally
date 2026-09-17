"use strict";
import * as tl from 'azure-pipelines-task-lib/task';
import * as fileSystem from "fs";
import * as JSON5 from 'json5';
import { VersionInfo } from "./models";
import { DotNetCoreVersionFetcher } from "./versionfetcher";
import { applyRollForwardPolicy, validRollForwardPolicies } from "./versionutilities";

export interface GlobalJsonVersion {
    version: string;
    rollForward?: string;
}

export class globalJsonFetcher {

    private workingDirectory: string;
    /**
     * The global json fetcher provider functionality to extract the version information from all global json in the working directory.
     * @param workingDirectory
     */
    constructor(workingDirectory: string) {
        this.workingDirectory = workingDirectory;
    }

    /**
     * Get all version information from all global.json starting from the working directory without duplicates.
     */
    public async GetVersions(): Promise<VersionInfo[]> {
        var versionInformation: VersionInfo[] = [] as VersionInfo[];
        var globalJsonVersions = this.getGlobalJsonVersions();
        let explicitFetcher = new DotNetCoreVersionFetcher(true);
        let nonExplicitFetcher = new DotNetCoreVersionFetcher(false);
        for (let index = 0; index < globalJsonVersions.length; index++) {
            const entry = globalJsonVersions[index];
            if (entry != null) {
                let channelSpec = entry.version;
                let matchingSpec: string | undefined;
                let versionFetcher = explicitFetcher;

                if (entry.rollForward) {
                    const resolvedSpec = applyRollForwardPolicy(entry.version, entry.rollForward);
                    if (resolvedSpec !== entry.version) {
                        versionFetcher = nonExplicitFetcher;
                        // Range specs (e.g., ">=8.0.100 <8.0.200" from patch/latestPatch)
                        // need a separate channel-compatible spec for VersionParts lookup
                        if (resolvedSpec.includes(' ')) {
                            const parts = entry.version.split('.');
                            channelSpec = `${parts[0]}.${parts[1]}.x`;
                            matchingSpec = resolvedSpec;
                        } else {
                            channelSpec = resolvedSpec;
                        }
                    }
                    console.log(`Applying rollForward policy '${entry.rollForward}' to version '${entry.version}', resolved version spec: '${matchingSpec || channelSpec}'`);
                }

                var versionInfo = await versionFetcher.getVersionInfo(channelSpec, "", "sdk", false, matchingSpec);
                console.log(`Resolved SDK version '${versionInfo.getVersion()}' from global.json (original version: '${entry.version}', rollForward: '${entry.rollForward || "disable"}')`);
                versionInformation.push(versionInfo);
            }
        }

        return Array.from(new Set(versionInformation)); // this remove all not unique values.
    }

    public getGlobalJsonVersions(): Array<GlobalJsonVersion | null | undefined> {
        let filePathsToGlobalJson = tl.findMatch(this.workingDirectory, "**/global.json");
        if (filePathsToGlobalJson == null || filePathsToGlobalJson.length == 0) {
            throw `Failed to find global.json at and inside path: ${this.workingDirectory}`;
        }

        return filePathsToGlobalJson.map(path => {
            var content = this.readGlobalJson(path);
            if (content != null) {
                console.log(`SDK version: ${content.sdk!.version} is specified by global.json at path: ${path}`);
                return {
                    version: content.sdk!.version,
                    rollForward: content.sdk?.rollForward
                };
            }

            return null;
        })
            .filter(d => d != null); // remove all global.json that can't read
    }

    private readGlobalJson(path: string): GlobalJson | null {
        let globalJson: GlobalJson | null = null;
        console.log(`Found a global.json at path: ${path}`);
        try {
            let fileContent = fileSystem.readFileSync(path);
            // Since here is a buffer, we need to check length property to determine if it is empty.
            if (!fileContent.length) {
                // do not throw if globa.json is empty, task need not install any version in such case.
                tl.warning(`global.json at path: ${path} is empty. No version is specified.`);
                return null;
            }

            globalJson = (JSON5.parse(fileContent.toString())) as GlobalJson;
        } catch (error) {
            // we throw if the global.json is invalid
            throw `The global.json at path: '${path}' has the wrong format. For information about global.json, visit here: https://docs.microsoft.com/en-us/dotnet/core/tools/global-json. Error while trying to read: ${error}`; // We don't throw if a global.json is invalid.
        }

        if (globalJson == null || globalJson.sdk == null || globalJson.sdk.version == null) {
            tl.warning(`The global.json at path: '${path}' has the wrong format. For information about global.json, visit here: https://docs.microsoft.com/en-us/dotnet/core/tools/global-json. Error while trying to read: Failed to read global.json at path: ${path}`);
            return null;
        }

        if (globalJson.sdk.rollForward && !validRollForwardPolicies.includes(globalJson.sdk.rollForward)) {
            tl.warning(`Invalid rollForward policy '${globalJson.sdk.rollForward}' in global.json at path: '${path}'. Supported values are: disable, patch, feature, minor, major, latestPatch, latestFeature, latestMinor, latestMajor. The rollForward policy will be ignored.`);
            globalJson.sdk.rollForward = undefined;
        }

        return globalJson;
    }

}

export class GlobalJson {
    public sdk?: sdk = undefined;
    constructor(version: string | null = null, rollForward?: string) {
        if (version != null) {
            this.sdk = new sdk(version, rollForward);
        }
    }
}

class sdk {
    public version: string;
    public rollForward?: string;
    constructor(version: string, rollForward?: string) {
        this.version = version;
        this.rollForward = rollForward;
    }
}
