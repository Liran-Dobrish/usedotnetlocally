"use strict";
import * as tl from 'azure-pipelines-task-lib/task';
import * as path from 'path';
import { Constants } from "../src/versionutilities";
let mockery = require('azure-pipelines-task-lib/lib-mocker');

const version = "2.1.1";
const installationPath: string = "installationPath"

mockery.enable({
    useCleanCache: true,
    warnOnReplace: false,
    warnOnUnregistered: false
});

mockery.registerMock('typed-rest-client/HttpClient', {
    HttpClient: function () {
        return {
            get: function (url: string, headers: any) {
                return "";
            }
        }
    }
});

let sdkFolderExists = true;
let sdkFileExists = true;
let runtimeFolderExists = true;
let runtimeFileExists = true;
mockery.registerMock('azure-pipelines-task-lib/task', {
    exist: function (elementPath: string) {
        if (elementPath == path.join(installationPath, Constants.relativeSdkPath, version)) {
            return sdkFolderExists;
        }
        else if (elementPath == path.join(installationPath, Constants.relativeSdkPath, `${version}.complete`)) {
            return sdkFileExists;
        }
        else if (elementPath == path.join(installationPath, Constants.relativeRuntimePath, version)) {
            return runtimeFolderExists;
        }
        else if (elementPath == path.join(installationPath, Constants.relativeRuntimePath, `${version}.complete`)) {
            return runtimeFileExists;
        }
        else if (elementPath == installationPath) {
            return true;
        }

        return false;
    },
    loc: function (locString: string, ...param: string[]) { return tl.loc(locString, param); },
    debug: function (message: string) { return tl.debug(message); },
    warning: function (message: string) { return tl.warning(message); },
    error: function (errorMessage: string) { return tl.error(errorMessage); },
    getVariable: function (variableName: string) { return tl.getVariable(variableName)!; },
    getInput: function (inputName: string, required: boolean) { return tl.getInput(inputName, required); },
    getHttpProxyConfiguration: function () { return ""; },
    getHttpCertConfiguration: function () { return "" },
    setResourcePath: function (path: string) { return; }
});

import { VersionInstaller } from "../src/versioninstaller";
let versionInstaller = new VersionInstaller("sdk", installationPath);

if (process.env["__case__"] == "nonexplicit") {
    let throwcount = 0;
    try {
        versionInstaller.isVersionInstalled("")
    }
    catch (ex) {
        throwcount++
    }

    try {
        versionInstaller.isVersionInstalled("2.1")
    }
    catch (ex) {
        throwcount++
    }

    try {
        versionInstaller.isVersionInstalled("2.1.x")
    }
    catch (ex) {
        throwcount++
    }

    if (throwcount == 3) {
        tl.setResult(tl.TaskResult.Failed, "ThrewAsExpected");
    }
    else {
        tl.setResult(tl.TaskResult.Succeeded, "ShouldHaveThrownInAllCases");
    }
}
else if (process.env["__case__"] == "folderorfilemissing") {
    sdkFolderExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    sdkFolderExists = true;
    sdkFileExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    sdkFolderExists = false;
    sdkFileExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    versionInstaller = new VersionInstaller("runtime", installationPath);
    runtimeFolderExists = true;
    runtimeFileExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    runtimeFolderExists = true;
    runtimeFileExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    runtimeFolderExists = true;
    runtimeFileExists = false;
    if (versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedFalse");
        throw "";
    }

    tl.setResult(tl.TaskResult.Succeeded, "ReturnedFalseForAll");
}
else if (process.env["__case__"] == "success") {
    if (!versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedTrue");
        throw "";
    }

    versionInstaller = new VersionInstaller("runtime", installationPath);
    if (!versionInstaller.isVersionInstalled(version)) {
        tl.setResult(tl.TaskResult.Failed, "ShouldHaveReturnedTrue");
        throw "";
    }

    tl.setResult(tl.TaskResult.Succeeded, "ReturnedTrue");
}