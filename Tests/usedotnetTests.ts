"use strict";
import * as os from 'os';
import * as tl from 'azure-pipelines-task-lib/task';
import { Constants } from '../src/versionutilities';
import { VersionInfo } from '../src/models';
import { setFlagsFromString } from 'v8';
import fs = require('fs');

let mockery = require('azure-pipelines-task-lib/lib-mocker');
let osType = "win";

//setup mocks
mockery.enable({
    useCleanCache: true,
    warnOnReplace: false,
    warnOnUnregistered: false
});

mockery.registerMock('fs', {
    ...fs,
    lstatSync: function (elementPath: string) {
        if (elementPath.indexOf(".") > -1 && !elementPath.endsWith("1.0.0") && !elementPath.endsWith("2.0.0") && !elementPath.endsWith("2.1.0")) {
            return {
                isDirectory: function () {
                    return false;
                }
            };
        }

        return {
            isDirectory: function () {
                return true;
            }
        };
    }
});

mockery.registerMock('azure-pipelines-task-lib/task', {
    getHttpProxyConfiguration: function () { return ""; },
    getHttpCertConfiguration: function () { return "" },
    setResourcePath: function (resourcePath: string) { return; },
    prependPath: function (toolPath: string): void {
        if (process.env["__case__"] == "globaltoolpathfailure" && toolPath.includes(Constants.relativeGlobalToolPath)) {
            throw tl.loc("ErrorWhileSettingDotNetToolPath");
        }

        if (toolPath.includes("installationPath") || toolPath.includes("agentstooldir")) {
            console.log(tl.loc("PrependingInstallationPath"))
            return;
        }

        if (toolPath.includes(Constants.relativeGlobalToolPath)) {
            console.log(tl.loc("PrependingGlobalToolPath"));
        }

        throw "";
    },
    osType: function () { return os.type(); },
    mkdirP: function (directoryPath: string) { return; },
    loc: function (locString: string, ...param: string[]) { return tl.loc(locString, param); },
    debug: function (message: string) { return tl.debug(message); },
    getVariable: function (variableName: string) {
        if (variableName == "Agent.ToolsDirectory") {
            return "agentstooldir";
        }

        return tl.getVariable(variableName);
    },
    getInput: function (inputName: string, required: boolean): string {
        if (inputName == "packageType") {
            return "sdk";
        }
        else if (inputName == "version") {
            return "2.2.1";
        }
        else if (inputName == "installationPath") {
            if (process.env["__case__"] == "skipinstallation") {
                return "";
            }

            return "installationPath";
        }
        return "";
    },
    getBoolInput: function (inputName: string, required: boolean): boolean {
        if (inputName == "includePreviewVersions") {
            if (required) {
                throw "";
            }

            return false;
        }
        else if (inputName == "performMultiLevelLookup") {
            if (required) {
                throw "";
            }

            return false;
        }
        return true;
    },
    getPathInput: function (inputName: string, required: boolean): string {
        if (inputName == "workingDirectory") {

            return "";
        }
        return "";
    },
    setResult: function (result: tl.TaskResult, message: string): void {
        tl.setResult(result, message);
    },
    setVariable: function (name: string, value: string, secret?: boolean) {
        tl.setVariable(name, value, secret ? true : false);
    },
    TaskResult: {
        Failed: tl.TaskResult.Failed,
        Succeeded: tl.TaskResult.Succeeded
    }
});

mockery.registerMock('./versionfetcher', {
    DotNetCoreVersionFetcher: function () {
        return {
            getVersionInfo: function (versionSpec: string, vsVersionSpec: string, packageType: string, includePreviewVersions: boolean): Promise<VersionInfo | null> {
                if (process.env["__case__"] == "matchingversionnotfound") {
                    return new Promise<VersionInfo | null>((resolve, reject) => {
                        resolve(null);
                    });
                }

                return new Promise<VersionInfo>((resolve, reject) => {
                    resolve(new VersionInfo(JSON.parse(`{"version":"2.1.0", "runtime-version":"2.1.100", "files":[{"name":"win-x64.zip", "url":"https://pathToWin/zip", "rid":"win-x64"}]}`), "sdk"));
                });
            },
            getDownloadUrl: function (versionInfo: VersionInfo): string {
                return versionInfo.getFiles()[0].url;
            }
        }
    }
});

mockery.registerMock('./versioninstaller', {
    VersionInstaller: function (pacakageType: string, receivedInstallationPath: string) {
        console.log(tl.loc("installationPathValueIs", receivedInstallationPath))
        if (process.env["__case__"] == "skipinstallation" && !receivedInstallationPath.includes("agentstooldir") && !receivedInstallationPath.includes("dotnet")) {
            throw "";
        }

        return {
            isVersionInstalled: function (version: string): boolean {
                if (process.env["__case__"] == "skipinstallation") {
                    return true;
                }

                return false;
            },
            downloadAndInstall: function (versionInfo: VersionInfo, downloadUrl: string): Promise<void> {
                console.log(tl.loc("DownloadAndInstallCalled"));
                return new Promise<void>((resolve, reject) => {
                    resolve();
                });
            }
        }
    }
});

mockery.registerMock('./nugetinstaller', {
    NuGetInstaller: {
        installNuGet: function (version: string): Promise<void> {
            return new Promise<void>((resolve, reject) => {
                resolve();
            });
        }
    }
});

process.env["USERPROFILE"] = "userprofile"
process.env.HOME = "home"

require('../usedotnet');