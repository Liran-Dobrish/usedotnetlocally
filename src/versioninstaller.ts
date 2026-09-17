"use strict";
import * as path from 'path';
import * as fs from "fs";

import * as tl from 'azure-pipelines-task-lib/task';
import * as toolLib from 'azure-pipelines-tool-lib/tool';

import * as utils from "./versionutilities";
import { VersionInfo } from "./models"
import { tinyGuid } from 'azure-pipelines-tasks-utility-common/tinyGuidUtility'

export class VersionInstaller {
    constructor(packageType: string, installationPath: string) {
        try {
            tl.exist(installationPath) || tl.mkdirP(installationPath);
        }
        catch (ex: any) {
            throw `Unable to access path: ${installationPath}. Error: ${ex.message}. Please make sure that agent process has access to the path.`;
        }

        this.packageType = packageType;
        this.installationPath = installationPath;
    }
    /**
     * Install a single version from a versionInfo
     * @param versionInfo the versionInfo object with all information from the version
     * @param downloadUrl The download url of the sdk / runtime.
     */
    public async downloadAndInstall(versionInfo: VersionInfo | null, downloadUrl: string): Promise<void> {
        if (!versionInfo || !versionInfo.getVersion() || !downloadUrl || !this.isValidHttpUrl(downloadUrl)) {
            throw `Version: ${versionInfo?.getVersion()} cannot be downloaded from URL: ${downloadUrl}. Either the URL or version is incorrect.`;
        }
        let version = versionInfo.getVersion();

        try {
            try {
                var downloadPath = await toolLib.downloadToolWithRetries(downloadUrl)
            }
            catch (ex) {
                tl.setResult(tl.TaskResult.Failed, `Version ${version} could not be downloaded from ${downloadUrl}`);
                // let feedFallbackUrl = "https://builds.dotnet.microsoft.com/dotnet";
                // try {
                //     tl.warning(tl.loc("CouldNotDownload", downloadUrl, ex));
                //     var downloadPath = await this.downloadFromFallbackUrl(feedFallbackUrl, this.packageType, version, downloadUrl);
                // } catch (ex) {
                //     tl.warning(tl.loc("CouldNotDownload", feedFallbackUrl, ex));
                //     var downloadPath = await this.downloadFromFallbackUrl("https://dotnetcli.azureedge.net/dotnet", this.packageType, version, downloadUrl);
                // }
            }

            // Extract
            console.log(`Extracting downloaded package ${downloadPath}.`);
            try {
                let tempDirectory = tl.getVariable('Agent.TempDirectory') || "";
                let extDirectory = path.join(tempDirectory, tinyGuid());
                var extPath = tl.osType().match(/^Win/) ? await toolLib.extractZip(downloadPath, extDirectory) : await toolLib.extractTar(downloadPath);
            }
            catch (ex) {
                throw `Failed while extracting downloaded package with error: ${ex}`;
            }

            // Copy folders
            tl.debug(`Copying all root folders into installation path: ${this.installationPath}`);
            var allRootLevelEnteriesInDir: string[] = tl.ls("", [extPath]).map(name => path.join(extPath, name));
            var directoriesTobeCopied: string[] = allRootLevelEnteriesInDir.filter(path => fs.lstatSync(path).isDirectory());
            directoriesTobeCopied.forEach((directoryPath) => {
                tl.cp(directoryPath, this.installationPath, "-rf", false);
            });

            // Copy files
            try {
                if (this.packageType == utils.Constants.sdk && this.isLatestInstalledVersion(version)) {
                    tl.debug(`Copying root files (such as dotnet.exe) into installation path: ${this.installationPath}`);
                    var filesToBeCopied = allRootLevelEnteriesInDir.filter(path => !fs.lstatSync(path).isDirectory());
                    filesToBeCopied.forEach((filePath) => {
                        tl.cp(filePath, this.installationPath, "-f", false);
                    });
                }
            }
            catch (ex) {
                tl.warning(`Failed to copy root files into installation path: ${this.installationPath}. Error: ${ex}`);
            }

            // Cache tool
            this.createInstallationCompleteFile(versionInfo);

            console.log(`Successfully installed .NET Core ${this.packageType} version ${version}.`);
        }
        catch (ex) {
            throw `Failed while installing version: ${version} at path: ${this.installationPath} with error: ${ex}`;
        }
    }

    /**
     * This checks if an explicit version is installed.
     * This doesn't work with a search pattern like 1.0.x.
     * @param version An explicit version. Like 1.0.1
     */
    public isVersionInstalled(version: string): boolean {
        if (!toolLib.isExplicitVersion(version)) {
            throw `Version: ${version} is not allowed. Versions to be installed should be of format: major.minor.patchversion. For example: 2.2.1`;
        }

        var isInstalled: boolean = false;
        if (this.packageType == utils.Constants.sdk) {
            isInstalled = tl.exist(path.join(this.installationPath, utils.Constants.relativeSdkPath, version)) && tl.exist(path.join(this.installationPath, utils.Constants.relativeSdkPath, `${version}.complete`));
        }
        else {
            isInstalled = tl.exist(path.join(this.installationPath, utils.Constants.relativeRuntimePath, version)) && tl.exist(path.join(this.installationPath, utils.Constants.relativeRuntimePath, `${version}.complete`));
        }

        isInstalled ? console.log(`Version: ${version} was found in cache.`) : console.log(`Version: ${version} was not found in cache.`);
        return isInstalled;
    }

    private createInstallationCompleteFile(versionInfo: VersionInfo): void {
        tl.debug(`Creating installation complete marker file for .Net core version ${versionInfo.getVersion()} and package type ${this.packageType}`);
        // always add for runtime as it is installed with sdk as well.
        var pathToVersionCompleteFile: string = "";
        if (this.packageType == utils.Constants.sdk) {
            let sdkVersion = versionInfo.getVersion();
            pathToVersionCompleteFile = path.join(this.installationPath, utils.Constants.relativeSdkPath, `${sdkVersion}.complete`);
            tl.writeFile(pathToVersionCompleteFile, `{ "version": "${sdkVersion}" }`);
        }

        let runtimeVersion = versionInfo.getRuntimeVersion();
        if (runtimeVersion) {
            pathToVersionCompleteFile = path.join(this.installationPath, utils.Constants.relativeRuntimePath, `${runtimeVersion}.complete`);
            tl.writeFile(pathToVersionCompleteFile, `{ "version": "${runtimeVersion}" }`);
        }
        else if (this.packageType == utils.Constants.runtime) {
            throw `Cannot find runtime version for package type: ${this.packageType} with version: ${versionInfo.getVersion()}`;
        }
    }

    private isLatestInstalledVersion(version: string): boolean {
        var pathTobeChecked = this.packageType == utils.Constants.sdk ? path.join(this.installationPath, utils.Constants.relativeSdkPath) : path.join(this.installationPath, utils.Constants.relativeRuntimePath);
        if (!tl.exist(pathTobeChecked)) {
            throw `Path: ${pathTobeChecked} could not be located/found. Make sure the path exists.`;
        }

        var allEnteries: string[] = tl.ls("", [pathTobeChecked]).map(name => path.join(pathTobeChecked, name));
        var folderPaths: string[] = allEnteries.filter(element => fs.lstatSync(element).isDirectory());
        var isLatest: boolean = folderPaths.findIndex(folderPath => {
            try {
                let versionFolderName = path.basename(folderPath);
                tl.debug(`Comparing if version being installed ${version} is greater than already installed version with folder name ${versionFolderName}`);
                return utils.versionCompareFunction(versionFolderName, version) > 0;
            }
            catch (ex) {
                // no op, folder name might not be in version format
            }
        }) < 0;

        var filePaths: string[] = allEnteries.filter(element => !fs.lstatSync(element).isDirectory());
        isLatest = isLatest && filePaths.findIndex(filePath => {
            try {
                var versionCompleteFileName = this.getVersionCompleteFileName(path.basename(filePath));
                tl.debug(`Comparing if version being installed ${version} is greater than already installed version with version complete file name ${versionCompleteFileName}`);
                return utils.versionCompareFunction(versionCompleteFileName, version) > 0
            }
            catch (ex) {
                // no op, file name might not be in version format
            }
        }) < 0;

        isLatest ? tl.debug(`Version: ${version} is the latest among the versions present at path: ${this.installationPath}`) : tl.debug(`Version: ${version} is not the latest among the versions present at path: ${this.installationPath}`);
        return isLatest;
    }

    private getVersionCompleteFileName(name: string): string {
        if (name && name.endsWith(".complete")) {
            var parts = name.split('.');
            var fileNameWithoutExtensionLength = name.length - (parts[parts.length - 1].length + 1);
            if (fileNameWithoutExtensionLength > 0) {
                return name.substr(0, fileNameWithoutExtensionLength);
            }
        }

        throw `File name ${name} is not a correct '.complete' file.`;
    }

    private async downloadFromFallbackUrl(fallBackUrl: string, packageType: string, version: string, downloadUrl: string): Promise<string> {
        let url = `${fallBackUrl}/${packageType === "runtime" ? "Runtime" : "Sdk"}/${version}/${downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1)}`;
        console.log("Using fallback url for download: " + url);
        var downloadPath = await toolLib.downloadToolWithRetries(url)
        return downloadPath;
    }

    private isValidHttpUrl(urlString: string): boolean {
        if (!urlString || urlString.trim().length === 0) {
            return false;
        }
        try {
            const u = new URL(urlString);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch {
            return false;
        }
    }

    private packageType: string;
    private installationPath: string;
}